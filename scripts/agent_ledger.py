#!/usr/bin/env python3
"""Edit one ROADMAP lease in a clean control checkout; never commit or push.

Use --root explicitly. JSON output describes local state only. A claim becomes
authoritative only after its ordinary fast-forward push succeeds and a fresh
fetch confirms the same token. Run a losing transaction again from fresh main.
"""

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import subprocess
import sys
import tempfile


class LedgerError(Exception):
    """An unsafe or unsupported ledger operation."""


ICONS = {"open": "⬜", "claimed": "🚧", "legacy": "🚧", "blocked": "⏸", "done": "✅"}
ITEM = re.compile(r"^- ([⬜🚧✅⏸]) \*\*(.+?)\*\*")
BOUNDARY = re.compile(r"^(?:#{1,6}(?:\s|$)|[-*+]\s)")
META = re.compile(r"^  <!-- agent-state: (\{.*\}) -->\r?\n?$")
ID = re.compile(r"rm-[0-9a-f]{16}\Z")
TOKEN = re.compile(r"[0-9a-f]{32}\Z")
CONFIG_DEFAULTS = {
    "roadmap_file": "ROADMAP.md", "lease_minutes": 90,
    "heartbeat_minutes": 15, "clock_skew_minutes": 5,
    "legacy_grace_minutes": 120, "blocked_recheck_minutes": 60,
}
COMMON_FIELDS = {"schema", "id", "state", "touch", "resources", "note"}
STATE_FIELDS = {
    "open": {"released_at"},
    "claimed": {"owner", "token", "branch", "claimed_at", "heartbeat_at", "lease_until"},
    "legacy": {"observed_at", "lease_until"},
    "blocked": {"retry_at", "blocked_at"},
    "done": {"completed_by", "completed_at", "branch"},
}


def require(condition, message):
    if not condition:
        raise LedgerError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(value):
    try:
        return json.loads(value, object_pairs_hook=unique_object)
    except (ValueError, TypeError) as exc:
        raise LedgerError(f"Invalid JSON: {exc}") from exc


def stamp(value):
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def instant(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value),
            "Lease timestamps must use UTC YYYY-MM-DDTHH:MM:SSZ")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise LedgerError(f"Invalid timestamp: {value}") from exc


def touch_path(value):
    require(isinstance(value, str) and value.strip(), "Touch paths must be nonempty strings")
    require(not any(char in value for char in "\\*?[]\n\r\x00"),
            "Use literal repository-relative touch paths with / separators, without globs")
    path = PurePosixPath(value)
    require(not path.is_absolute() and ".." not in path.parts and ".git" not in path.parts,
            f"Unsafe touch path: {value}")
    require(not re.match(r"^[A-Za-z]:", value), f"Touch path must be relative: {value}")
    return str(path)


def resources(values):
    require(isinstance(values, list), "resources must be a list")
    result = []
    for value in values:
        require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}", value),
                "Resource names must be short names such as workspace-settings or editor/save")
        result.append(value.lower())
    return sorted(set(result))


def scopes(touch, semantic):
    require(isinstance(touch, list), "touch must be a list")
    return sorted(set(touch_path(value) for value in touch)), resources(semantic)


def path_overlap(left, right):
    return left == "." or right == "." or left == right or left.startswith(right + "/") or right.startswith(left + "/")


def validate_state(state, icon):
    require(isinstance(state, dict), "agent-state must be a JSON object")
    kind = state.get("state")
    require(type(state.get("schema")) is int and state["schema"] == 1, "Unsupported agent-state schema")
    require(isinstance(kind, str) and kind in ICONS, "Unknown agent-state state")
    require(icon == ICONS[kind], "ROADMAP status icon disagrees with agent-state")
    allowed = COMMON_FIELDS | STATE_FIELDS[kind]
    require(not set(state) - allowed, f"Unknown agent-state fields: {sorted(set(state) - allowed)}")
    required = (COMMON_FIELDS - {"note"}) | STATE_FIELDS[kind]
    require(not required - set(state), f"Missing agent-state fields: {sorted(required - set(state))}")
    require(isinstance(state["id"], str) and ID.fullmatch(state["id"]), "Invalid item ID")
    normalized = scopes(state["touch"], state["resources"])
    require(normalized == (state["touch"], state["resources"]), "Metadata scope must be normalized and sorted")
    require("note" not in state or isinstance(state["note"], str), "note must be a string")
    for key in ("claimed_at", "heartbeat_at", "lease_until", "observed_at", "released_at", "blocked_at", "retry_at", "completed_at"):
        if key in state:
            instant(state[key])
    if kind == "claimed":
        require(isinstance(state["owner"], str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}", state["owner"]),
                "Invalid owner ID")
        require(isinstance(state["token"], str) and TOKEN.fullmatch(state["token"]), "Invalid claim token")
        require(state["branch"] == f"agent/{state['id']}/{state['token'][:12]}", "Branch disagrees with claim token")
        require(instant(state["claimed_at"]) <= instant(state["heartbeat_at"]) < instant(state["lease_until"]),
                "Invalid claim timestamp order")
        require(state["touch"] or state["resources"], "Claim must declare at least one touch path or resource")
    if kind == "legacy":
        require(instant(state["observed_at"]) < instant(state["lease_until"]), "Invalid legacy grace period")
    if kind == "blocked":
        require(instant(state["blocked_at"]) < instant(state["retry_at"]), "Invalid blocked retry time")
    if kind == "done":
        require(isinstance(state["completed_by"], str) and state["completed_by"], "Missing completion owner")
        require(isinstance(state["branch"], str) and state["branch"].startswith(f"agent/{state['id']}/"), "Invalid completed branch")


class Ledger:
    def __init__(self, root, now=None):
        self.root = Path(root).resolve()
        self.now = now or datetime.now(timezone.utc)
        require(self.now.tzinfo is not None, "Current time must be timezone-aware")
        document = (self.root / "CONSTITUTION.md").read_text(encoding="utf-8")
        start, end = "<!-- agent-config:start -->", "<!-- agent-config:end -->"
        require(document.count(start) == 1 and document.count(end) == 1, "CONSTITUTION.md needs exactly one agent-config block")
        first, last = document.index(start), document.index(end)
        require(first < last, "agent-config markers are out of order")
        block = document[first + len(start):last]
        match = re.search(r"(?ms)^```json[ \t]*\r?\n(.*?)^```[ \t]*\r?$", block)
        require(match is not None, "agent-config needs a fenced JSON object")
        configured = read_json(match.group(1))
        require(isinstance(configured, dict), "agent-config must be an object")
        self.config = CONFIG_DEFAULTS | configured
        for key, default in CONFIG_DEFAULTS.items():
            if isinstance(default, int):
                value = self.config[key]
                require(type(value) is int and value >= (0 if key == "clock_skew_minutes" else 1),
                        f"Invalid config number: {key}")
        require(self.config["lease_minutes"] > self.config["clock_skew_minutes"], "Lease must exceed clock skew")
        require(self.config["heartbeat_minutes"] + self.config["clock_skew_minutes"] < self.config["lease_minutes"],
                "Heartbeat plus clock skew must be shorter than the lease")
        roadmap = touch_path(self.config["roadmap_file"])
        self.path = self.root / roadmap
        require(self.path.resolve().is_relative_to(self.root) and not self.path.is_symlink(), "Roadmap must stay inside this checkout")
        self.original = self.path.read_bytes()
        self.lines = self.original.decode("utf-8").splitlines(keepends=True)
        self.eol = "\r\n" if b"\r\n" in self.original else "\n"
        self.skew = timedelta(minutes=self.config["clock_skew_minutes"])
        self.items = []
        recognized_metadata = set()
        for index, line in enumerate(self.lines):
            match = ITEM.match(line)
            if not match:
                continue
            end_index = index + 1
            while end_index < len(self.lines) and not BOUNDARY.match(self.lines[end_index]):
                end_index += 1
            while end_index > index + 1 and not self.lines[end_index - 1].strip():
                end_index -= 1
            state = None
            if index + 1 < end_index and "<!-- agent-state:" in self.lines[index + 1]:
                metadata = META.fullmatch(self.lines[index + 1])
                require(metadata is not None, f"Malformed metadata after title: {match[2]}")
                state = read_json(metadata[1])
                validate_state(state, match[1])
                recognized_metadata.add(index + 1)
            self.items.append({"start": index, "end": end_index, "icon": match[1], "title": match[2], "metadata": state})
        for index, line in enumerate(self.lines):
            require("<!-- agent-state" not in line or index in recognized_metadata,
                    f"Unrecognized or nonadjacent agent-state metadata at line {index + 1}")
        ids = [item["metadata"]["id"] for item in self.items if item["metadata"]]
        require(len(ids) == len(set(ids)), "Duplicate item IDs in ROADMAP")

    def clean(self):
        try:
            actual = subprocess.run(["git", "-C", str(self.root), "rev-parse", "--show-toplevel"],
                                    text=True, capture_output=True, check=True).stdout.strip()
            require(Path(actual).resolve() == self.root, "--root must be the Git checkout root")
            dirty = subprocess.run(["git", "-C", str(self.root), "status", "--porcelain", "--untracked-files=all"],
                                   text=True, capture_output=True, check=True).stdout
        except (OSError, subprocess.CalledProcessError) as exc:
            raise LedgerError("Mutation requires Git and a clean, isolated control checkout") from exc
        require(not dirty, "Control checkout is dirty; commit or discard only your own control edit, then retry from fresh main")
        require(self.path.read_bytes() == self.original, "ROADMAP changed during this operation; reload and retry")

    def target(self, title=None, item_id=None):
        matches = [item for item in self.items if item["title"] == title] if title is not None else [
            item for item in self.items if item["metadata"] and item["metadata"]["id"] == item_id]
        require(len(matches) == 1, "Select exactly one item; missing or duplicate exact titles must be corrected before claiming")
        return matches[0]

    def fenced(self, metadata):
        return metadata and metadata["state"] in ("claimed", "legacy") and self.now < instant(metadata["lease_until"]) + self.skew

    def owned(self, item_id, token, margin=0):
        require(margin >= 0, "Check margin must be nonnegative")
        item = self.target(item_id=item_id)
        state = item["metadata"]
        require(state["state"] == "claimed" and state.get("token") == token, "Stale token or item is not claimed")
        require(self.now + self.skew + timedelta(minutes=margin) < instant(state["lease_until"]),
                "Lease expired or insufficient time remains; do not resume with this token, re-claim after the recovery boundary")
        require(self.now >= instant(state["heartbeat_at"]) - self.skew, "Clock precedes the last heartbeat; fix the clock before continuing")
        return item

    def warnings(self):
        return [f"Unknown overlap: {item['title']}; inspect its work and declare its scope before overlapping work" for item in self.items
                if (item["icon"] == "🚧" and item["metadata"] is None)
                or (self.fenced(item["metadata"]) and not item["metadata"]["touch"] and not item["metadata"]["resources"])]

    def listing(self):
        output = []
        for item in self.items:
            state = item["metadata"]
            availability = {"⬜": "open", "🚧": "legacy-unobserved", "✅": "done", "⏸": "blocked-unresolved"}[item["icon"]]
            if state:
                availability = state["state"]
                if state["state"] in ("claimed", "legacy") and not self.fenced(state):
                    availability = "reclaimable"
                if state["state"] == "blocked" and self.now >= instant(state["retry_at"]) + self.skew:
                    availability = "retryable"
            output.append({"title": item["title"], "availability": availability, "metadata": state})
        return {"items": output, "warnings": self.warnings()}

    def write(self, item, state, finish=False):
        validate_state(state, ICONS[state["state"]])
        self.clean()
        old = self.lines[item["start"]:item["end"]]
        body = old[1:]
        if item["metadata"]:
            body = body[1:]
            if body and body[0].startswith("  Agent: "):
                body = body[1:]
        first = old[0][:2] + ICONS[state["state"]] + old[0][3:]
        if not first.endswith("\n"):
            first += self.eol
        # Escaping markup delimiters keeps arbitrary notes inside one HTML comment.
        metadata = json.dumps(state, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e")
        owner = state.get("owner") or ("completed by " + state["completed_by"] if state["state"] == "done" else "legacy owner unknown" if state["state"] == "legacy" else "unclaimed")
        label = f"  Agent: {owner} | item: {state['id']}"
        if "lease_until" in state:
            label += f" | lease until: {state['lease_until']}"
        if "retry_at" in state:
            label += f" | retry after: {state['retry_at']}"
        replacement = [first, f"  <!-- agent-state: {metadata} -->{self.eol}", label + self.eol] + body
        lines = self.lines[:item["start"]] + ([] if finish else replacement) + self.lines[item["end"]:]
        if finish:
            headings = [index for index, line in enumerate(lines) if re.fullmatch(r"## Implemented[ \t]*\r?\n?", line)]
            require(len(headings) == 1, "Finish needs exactly one ## Implemented heading")
            position = headings[0] + 1
            if not lines[headings[0]].endswith("\n"):
                lines[headings[0]] += self.eol
            if replacement and not replacement[-1].endswith("\n"):
                replacement[-1] += self.eol
            lines[position:position] = [self.eol] + replacement + [self.eol]
        updated = "".join(lines).encode("utf-8")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=self.path.parent, prefix=".roadmap-", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(updated)
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temporary, self.path.stat().st_mode)
            require(self.path.read_bytes() == self.original, "ROADMAP changed during write; retry in an isolated checkout")
            os.replace(temporary, self.path)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()
        return {"title": item["title"], "metadata": state, "local_only": True, "warnings": self.warnings()}

    def execute(self, command, **args):
        if command == "list":
            return self.listing()
        if command in ("claim", "observe"):
            item = self.target(title=args["title"])
            existing = item["metadata"]
            touch, semantic = scopes(args.get("touch", []), args.get("resource", []))
            state = {"schema": 1, "id": existing["id"] if existing else "rm-" + secrets.token_hex(8),
                     "state": "legacy" if command == "observe" else "claimed", "touch": touch, "resources": semantic}
            if existing and "note" in existing:
                state["note"] = existing["note"]
            if command == "observe":
                if existing:
                    require(existing["state"] == "legacy", "Observe applies only to legacy claims")
                    # New evidence can widen a reservation, but cannot erase its
                    # previous scope or keep an abandoned worker alive forever.
                    widened = dict(existing, touch=sorted(set(existing["touch"]) | set(touch)),
                                   resources=sorted(set(existing["resources"]) | set(semantic)), note=args["note"])
                    if widened == existing:
                        return {"title": item["title"], "metadata": existing, "local_only": True, "unchanged": True, "warnings": self.warnings()}
                    return self.write(item, widened)
                require(item["icon"] == "🚧", "Observe applies only to legacy 🚧 items without metadata")
                state.update(observed_at=stamp(self.now), lease_until=stamp(self.now + timedelta(minutes=self.config["legacy_grace_minutes"])), note=args["note"])
            else:
                require(item["icon"] != "✅", "Completed items cannot be claimed")
                require(existing is not None or item["icon"] == "⬜", "Observe a legacy claim first; unresolved blocked items need a documented retry time")
                require(not self.fenced(existing), "Item is already claimed or inside its recovery grace boundary")
                if existing and existing["state"] == "blocked":
                    require(self.now >= instant(existing["retry_at"]) + self.skew, "Blocked item is not due for retry")
                require(touch or semantic, "Declare at least one --touch or --resource")
                for other in self.items:
                    held = other["metadata"]
                    if other is item or not self.fenced(held):
                        continue
                    require(held.get("owner") != args["agent"], "Agent already owns a live claim; finish, block, or release it first")
                    require(not set(semantic) & set(held["resources"]), f"Resource overlap with: {other['title']}")
                    require(not any(path_overlap(left, right) for left in touch for right in held["touch"]), f"Touch-path overlap with: {other['title']}")
                token = secrets.token_hex(16)
                state.update(owner=args["agent"], token=token, branch=f"agent/{state['id']}/{token[:12]}", claimed_at=stamp(self.now),
                             heartbeat_at=stamp(self.now), lease_until=stamp(self.now + timedelta(minutes=self.config["lease_minutes"])))
            return self.write(item, state)
        item = self.owned(args["id"], args["token"], args.get("margin_minutes", 0))
        current = item["metadata"]
        if command == "check":
            for other in self.items:
                held = other["metadata"]
                if other is item or not self.fenced(held):
                    continue
                overlap = set(current["resources"]) & set(held["resources"]) or any(
                    path_overlap(left, right) for left in current["touch"] for right in held["touch"])
                require(not overlap, f"Scope now overlaps {other['title']}; stop publication, preserve work, and release/replan")
            return {"title": item["title"], "metadata": current, "valid": True, "local_only": True}
        if command == "renew":
            state = dict(current, heartbeat_at=stamp(self.now), lease_until=stamp(self.now + timedelta(minutes=self.config["lease_minutes"])))
        else:
            state = {key: value for key, value in current.items() if key in COMMON_FIELDS}
            state["note"] = args["note"]
            state["state"] = {"release": "open", "block": "blocked", "finish": "done"}[command]
            if command == "release":
                state["released_at"] = stamp(self.now)
            elif command == "block":
                state.update(blocked_at=stamp(self.now), retry_at=stamp(self.now + timedelta(minutes=self.config["blocked_recheck_minutes"])))
            else:
                state.update(completed_at=stamp(self.now), completed_by=current["owner"], branch=current["branch"])
        return self.write(item, state, finish=command == "finish")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Explicit checkout root; mutation requires a clean isolated control checkout")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list", help="Read ownership, eligibility, and unknown legacy scope warnings")
    for name in ("claim", "observe", "renew", "check", "release", "block", "finish"):
        command = commands.add_parser(name)
        if name in ("claim", "observe"):
            command.add_argument("--title", required=True, help="Exact, unique bold ROADMAP title")
            command.add_argument("--touch", action="append", default=[], help="Literal repo-relative path; directories reserve every descendant")
            command.add_argument("--resource", action="append", default=[], help="Shared semantic resource name")
        else:
            command.add_argument("--id", required=True)
            command.add_argument("--token", required=True)
        if name == "claim":
            command.add_argument("--agent", required=True, help="Unique tool and session ID")
        if name == "check":
            command.add_argument("--margin-minutes", type=int, default=0)
        if name in ("observe", "release", "block", "finish"):
            command.add_argument("--note", required=True)
    options = vars(parser.parse_args(argv))
    root, command = options.pop("root"), options.pop("command")
    try:
        result = Ledger(root).execute(command, **options)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (LedgerError, OSError, UnicodeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

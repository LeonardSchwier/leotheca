#!/usr/bin/env bash
# Run a command up to three times, for steps that download tooling from a
# release CDN that answers 502/503/504 now and then (Tauri bundling tools,
# the Gradle wrapper distribution). Usage: scripts/retry.sh <command> [args...]
#
# Sleeps 20 s, then 60 s between attempts (RETRY_SLEEPS overrides the list,
# space separated seconds, for tests). Prints every attempt. Runs the command
# again only after a failure and returns the exit code of the last attempt, so
# a real compile or test failure still fails the step, only later.
if [ "$#" -eq 0 ]; then
  echo "usage: retry.sh <command> [args...]" >&2
  exit 2
fi

read -r -a sleeps <<<"${RETRY_SLEEPS:-20 60}"
attempts=$((${#sleeps[@]} + 1))
attempt=1
while true; do
  echo "retry.sh: attempt $attempt of $attempts: $*" >&2
  "$@"
  status=$?
  if [ "$status" -eq 0 ]; then
    exit 0
  fi
  echo "retry.sh: attempt $attempt of $attempts failed with exit code $status" >&2
  if [ "$attempt" -ge "$attempts" ]; then
    exit "$status"
  fi
  echo "retry.sh: sleeping ${sleeps[$((attempt - 1))]}s before the next attempt" >&2
  sleep "${sleeps[$((attempt - 1))]}"
  attempt=$((attempt + 1))
done

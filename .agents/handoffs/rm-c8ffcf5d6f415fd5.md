Task: rm-c8ffcf5d6f415fd5 - Serialise release publish of the dev-build release
Owner/token: released (finished)
Scope: .github/workflows/release.yml, master-spec.md
Landed: 145fb1e on main. The publish job has a concurrency group (release-publish-<tag> for tags, release-publish-dev-build otherwise), cancel-in-progress false.
Checks: YAML parse of release.yml (python yaml, concurrency keys read back); actionlint not installed; prettier --check clean; check_master_spec.py OK; hosted Release run 42357877866 on 145fb1e completed success including publish; Rules and Agent policy success. CI run on 145fb1e was still in progress when finishing.
Not proven: the original overlap race itself was not reproduced; the group only queues, it cannot be shown to fix a race without two overlapping runs.
Next action: none

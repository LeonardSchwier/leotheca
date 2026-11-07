cask "leotheca" do
  # TODO: fill in once a real macOS build exists, see README.md in this
  # directory for the full list of what's blocking that.
  # Matches the root VERSION file today; this whole cask is still a
  # non-submittable draft (see sha256 below and README.md), so it isn't part
  # of `npm run check-version`'s automated coverage, but keeping this number
  # honest avoids yet another stray "1.0.0" for a project that hasn't tagged
  # a release yet.
  version "0.1.0"
  sha256 "TODO_REPLACE_WITH_REAL_SHA256_OF_THE_RELEASED_DMG"

  # TODO: confirm the actual asset name/extension release.yml's future
  # macOS job produces (Tauri's default bundle target is .dmg; an
  # .app.tar.gz is also possible depending on bundle config).
  url "https://github.com/LeonardSchwier/leotheca/releases/download/v#{version}/Leotheca_#{version}_universal.dmg"
  name "Leotheca"
  desc "Free and open source markdown viewer and editor for a local folder of notes"
  homepage "https://github.com/LeonardSchwier/leotheca"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates false
  depends_on macos: ">= :big_sur" # TODO: confirm the real minimum once a macOS build target exists and is tested.

  app "Leotheca.app"

  zap trash: [
    "~/Library/Application Support/com.leonardschwier.leotheca",
    "~/Library/Preferences/com.leonardschwier.leotheca.plist",
    "~/Library/Saved Application State/com.leonardschwier.leotheca.savedState",
  ]
end

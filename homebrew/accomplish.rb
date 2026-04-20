cask "accomplish" do
  arch arm: "arm64", intel: "x64"

  version "0.3.8"
  sha256 arm:   "3532dbc016e35a5a0037ce88506d8717987371dce9fcadd00e98982284c7e554",
         intel: "420028c37b1cd78718be01ab83cde1a3d9704eb65be2416290696e634efe7ad3"

  url "https://github.com/accomplish-ai/accomplish/releases/download/v#{version}/Accomplish-#{version}-mac-#{arch}.dmg",
      verified: "github.com/accomplish-ai/accomplish/"
  name "Accomplish"
  desc "AI-powered desktop automation and productivity agent"
  homepage "https://github.com/accomplish-ai/accomplish"

  livecheck do
    url :url
    strategy :github_latest
    regex(/^v?(\d+(?:\.\d+)+)$/i)
  end

  app "Accomplish (formerly Openwork).app"

  # The application is not notarized by Apple yet, so users may need to
  # clear the quarantine attribute after install.
  caveats do
    <<~EOS
      If you receive a "damaged" or "can't be opened" error, run:
        sudo xattr -c '/Applications/Accomplish (formerly Openwork).app'
    EOS
  end

  zap trash: [
    "~/Library/Application Support/ai.accomplish.desktop",
    "~/Library/Application Support/Accomplish (formerly Openwork)",
    "~/Library/Logs/Accomplish (formerly Openwork)",
    "~/Library/Preferences/ai.accomplish.desktop.plist",
    "~/Library/Saved Application State/ai.accomplish.desktop.savedState",
  ]
end

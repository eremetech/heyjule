const {
  createRunOncePlugin,
  withPodfile,
  withXcodeProject,
} = require("expo/config-plugins");

const podfileMarker = "heyjule: keep Expo script paths quoted";
const reactNativeScriptExpression =
  "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'";

function withPathSafePodfile(config) {
  return withPodfile(config, (podfileConfig) => {
    const podfile = podfileConfig.modResults.contents;
    if (podfile.includes(podfileMarker)) return podfileConfig;

    const postInstallEnd = "\n  end\nend\n";
    const insertionIndex = podfile.lastIndexOf(postInstallEnd);
    if (insertionIndex < 0) {
      throw new Error("Unable to locate the Expo Podfile post_install block");
    }

    const patch = `

    # ${podfileMarker} when the repository path contains spaces.
    installer.pods_project.targets.each do |pod_target|
      next unless pod_target.name == 'EXConstants'

      pod_target.shell_script_build_phases.each do |phase|
        next unless phase.name == '[CP-User] Generate app.config for prebuilt Constants.manifest'

        phase.shell_script = 'bash -l -c "\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\""'
      end
    end`;

    podfileConfig.modResults.contents =
      podfile.slice(0, insertionIndex) + patch + podfile.slice(insertionIndex);
    return podfileConfig;
  });
}

function withPathSafeReactNativeBundle(config) {
  return withXcodeProject(config, (projectConfig) => {
    const phases =
      projectConfig.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    const unsafeCommand = `\`\\"$NODE_BINARY\\" --print \\"${reactNativeScriptExpression}\\"\``;
    const safeCommand = [
      `REACT_NATIVE_XCODE_SCRIPT=\\"$(\\"$NODE_BINARY\\" --print \\"${reactNativeScriptExpression}\\")\\"`,
      '\\"$REACT_NATIVE_XCODE_SCRIPT\\"',
    ].join("\\n");

    for (const phase of Object.values(phases)) {
      if (
        !phase ||
        typeof phase !== "object" ||
        phase.name !== '"Bundle React Native code and images"' ||
        typeof phase.shellScript !== "string"
      ) {
        continue;
      }

      phase.shellScript = phase.shellScript.replace(unsafeCommand, safeCommand);
    }

    return projectConfig;
  });
}

function withPathSafeIosBuild(config) {
  return withPathSafeReactNativeBundle(withPathSafePodfile(config));
}

module.exports = createRunOncePlugin(
  withPathSafeIosBuild,
  "with-path-safe-ios-build",
  "1.0.0",
);

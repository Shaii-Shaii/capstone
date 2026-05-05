const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function patchFile(relativePath, replacements) {
  const filePath = path.join(root, relativePath);

  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-worklets-cmake] Skipped missing file: ${relativePath}`);
    return;
  }

  let contents = fs.readFileSync(filePath, "utf8");
  let patched = contents;

  for (const [from, to] of replacements) {
    patched = patched.replace(from, to);
  }

  if (patched !== contents) {
    fs.writeFileSync(filePath, patched);
    console.log(`[patch-worklets-cmake] Patched ${relativePath}`);
  }
}

patchFile("node_modules/react-native-worklets/android/CMakeLists.txt", [
  [
    `set(CPP_SHARED "\${CMAKE_ANDROID_NDK}/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/\${CMAKE_ANDROID_ARCH_ABI}/libc++_shared.so")
`,
    "",
  ],
  [
    "target_link_libraries(worklets log ReactAndroid::jsi fbjni::fbjni ${CPP_SHARED})",
    "target_link_libraries(worklets log c++_shared ReactAndroid::jsi fbjni::fbjni)",
  ],
  [
    "target_link_libraries(worklets log ReactAndroid::jsi fbjni::fbjni)",
    "target_link_libraries(worklets log c++_shared ReactAndroid::jsi fbjni::fbjni)",
  ],
  [
    `string(APPEND CMAKE_SHARED_LINKER_FLAGS " -lc++_shared")

`,
    "",
  ],
]);

patchFile("node_modules/react-native-worklets-core/android/CMakeLists.txt", [
  [
    `set(CPP_SHARED "\${CMAKE_ANDROID_NDK}/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/\${CMAKE_ANDROID_ARCH_ABI}/libc++_shared.so")
`,
    "",
  ],
  [
    `target_link_libraries(
  \${PACKAGE_NAME}
  log
  android
)`,
    `target_link_libraries(
  \${PACKAGE_NAME}
  log
  android
  c++_shared
)`,
  ],
  [
    `target_link_libraries(
  \${PACKAGE_NAME}
  \${CPP_SHARED}
)

`,
    "",
  ],
]);

patchFile("node_modules/react-native-vision-camera/android/CMakeLists.txt", [
  [
    `        \${PACKAGE_NAME}
        \${LOG_LIB}                          # <-- Logcat logger
        android                             # <-- Android JNI core
        ReactAndroid::jsi                   # <-- RN: JSI`,
    `        \${PACKAGE_NAME}
        \${LOG_LIB}                          # <-- Logcat logger
        android                             # <-- Android JNI core
        c++_shared                          # <-- Android C++ runtime
        ReactAndroid::jsi                   # <-- RN: JSI`,
  ],
  [
    `    message("VisionCamera: Linking react-native-worklets...")
    find_package(react-native-worklets-core REQUIRED CONFIG)
    target_link_libraries(
            \${PACKAGE_NAME}
            react-native-worklets-core::rnworklets
    )`,
    `    message("VisionCamera: Linking react-native-worklets...")
    target_include_directories(
            \${PACKAGE_NAME}
            PRIVATE
            "\${NODE_MODULES_DIR}/react-native-worklets-core/android/build/headers/rnworklets"
    )
    file(GLOB RNWORKLETS_LIB
            "\${NODE_MODULES_DIR}/react-native-worklets-core/android/build/intermediates/cxx/\${CMAKE_BUILD_TYPE}/*/obj/\${ANDROID_ABI}/librnworklets.so"
    )
    target_link_libraries(
            \${PACKAGE_NAME}
            \${RNWORKLETS_LIB}
    )`,
  ],
]);

patchFile("node_modules/react-native-reanimated/android/CMakeLists.txt", [
  [
    "target_link_libraries(reanimated log ReactAndroid::jsi fbjni::fbjni android\n                      worklets)",
    "target_link_libraries(reanimated log c++_shared ReactAndroid::jsi fbjni::fbjni android\n                      worklets)",
  ],
]);

patchFile("node_modules/react-native/ReactAndroid/cmake-utils/ReactNative-application.cmake", [
  [
    `target_link_libraries(\${CMAKE_PROJECT_NAME}
        fbjni                               # via 3rd party prefab`,
    `target_link_libraries(\${CMAKE_PROJECT_NAME}
        c++_shared                          # Android C++ runtime
        fbjni                               # via 3rd party prefab`,
  ],
  [
    `        foreach(autolinked_library \${AUTOLINKED_LIBRARIES})
            target_link_libraries(\${autolinked_library} common_flags)`,
    `        foreach(autolinked_library \${AUTOLINKED_LIBRARIES})
            target_link_libraries(\${autolinked_library} c++_shared)
            target_link_libraries(\${autolinked_library} common_flags)`,
  ],
]);

patchFile("node_modules/react-native-safe-area-context/android/src/main/jni/CMakeLists.txt", [
  [
    `  target_link_libraries(
          \${LIB_TARGET_NAME}
          fbjni
          jsi
          reactnative`,
    `  target_link_libraries(
          \${LIB_TARGET_NAME}
          c++_shared
          fbjni
          jsi
          reactnative`,
  ],
  [
    `  target_link_libraries(
          \${LIB_TARGET_NAME}
          fbjni
          folly_runtime`,
    `  target_link_libraries(
          \${LIB_TARGET_NAME}
          c++_shared
          fbjni
          folly_runtime`,
  ],
]);

patchFile("node_modules/react-native-screens/android/src/main/jni/CMakeLists.txt", [
  [
    `  target_link_libraries(
    \${LIB_TARGET_NAME}
    ReactAndroid::reactnative
    ReactAndroid::jsi`,
    `  target_link_libraries(
    \${LIB_TARGET_NAME}
    c++_shared
    ReactAndroid::reactnative
    ReactAndroid::jsi`,
  ],
  [
    `  target_link_libraries(
    \${LIB_TARGET_NAME}
    fbjni
    folly_runtime`,
    `  target_link_libraries(
    \${LIB_TARGET_NAME}
    c++_shared
    fbjni
    folly_runtime`,
  ],
]);

patchFile("node_modules/react-native-gesture-handler/android/src/main/jni/CMakeLists.txt", [
  [
    `target_link_libraries(
  \${PACKAGE_NAME}
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni`,
    `target_link_libraries(
  \${PACKAGE_NAME}
  c++_shared
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni`,
  ],
]);

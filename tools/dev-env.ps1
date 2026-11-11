# One PayAlert mobile toolchain for the CURRENT PowerShell session only (does not change system settings).
# Usage:  . .\tools\dev-env.ps1      (note the leading dot)
$dev = 'D:\dev'
$env:JAVA_HOME = "$dev\jdk17"
$env:ANDROID_HOME = "$dev\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PUB_CACHE = "$dev\pub-cache"
$env:GRADLE_USER_HOME = "$dev\gradle-home"
$env:ANDROID_AVD_HOME = "$dev\avd"
$env:Path = @(
  "$dev\flutter\bin",
  "$env:JAVA_HOME\bin",
  "$env:ANDROID_HOME\cmdline-tools\latest\bin",
  "$env:ANDROID_HOME\platform-tools",
  "$env:ANDROID_HOME\emulator",
  $env:Path
) -join ';'
Write-Host "Flutter, Java 17 and the Android SDK from $dev are on PATH for this session."

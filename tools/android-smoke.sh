#!/usr/bin/env bash
# Used by .github/workflows/android-check.yml inside the emulator job.
set -x
adb install -r app.apk
adb logcat -c
adb shell monkey -p com.saulls.mechgarage -c android.intent.category.LAUNCHER 1
sleep 45
adb exec-out screencap -p > screen.png
adb logcat -d > logcat.txt
echo "===== is it still running? ====="
adb shell pidof com.saulls.mechgarage || echo "NOT RUNNING (it closed)"
echo "===== crash lines ====="
grep -E -A 40 "FATAL EXCEPTION|AndroidRuntime|Unhandled managed exception|monodroid.*(error|Error)|System\.[A-Za-z]*Exception|Java\.Lang\.[A-Za-z]*Exception" logcat.txt | head -150 | tee crash.txt
echo "===== web page messages ====="
grep -E "chromium|Console|MechGarage" logcat.txt | head -60
exit 0

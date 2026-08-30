# Open the installed ProFitness APK from Orbit

Inspected `hamzaoykurt/profitnessapp` at commit `09f299d45cd46238420dd24ae4f4e108ba3a67fa`.
The Android package is `com.avonix.profitness`. The current manifest only accepts password recovery links, not normal app-opening links.

`open-app.patch` adds a separate `profitness://open` intent filter to `MainActivity`. Existing recovery links stay unchanged. The normal app startup and authentication remain in control; no tokens, workout data or automatic actions are passed.

Apply the patch in the ProFitness repository, build using the existing signing configuration, and install the resulting APK **over the existing app with the same signing key**. Do not uninstall the app to work around a signature mismatch. No APK was built or installed by this Orbit change.

```sh
git apply /path/to/orbit/integrations/profitness/open-app.patch
```

The existing `Android CI/CD Release` workflow produces an APK. Retain the existing package ID and use an appropriate versionCode for an update. Do not create a replacement signing key.

Device verification after installing the updated APK:

```sh
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d 'profitness://open' com.avonix.profitness
```

Then tap **Fitness’i aç** in Orbit on the Android phone. Chrome's explicit package intent opens the APK with a fallback to Orbit's `/fitness` help page. Desktop visits show the help page. Custom schemes may be handled differently in other Android browsers; this must be verified on the physical phone.

This is an app-opening integration only. Orbit's sports counter is manual and does not claim to synchronize workouts.

References: [Android browser intents](https://developer.chrome.com/docs/android/intents), [the inspected manifest](https://github.com/hamzaoykurt/profitnessapp/blob/09f299d45cd46238420dd24ae4f4e108ba3a67fa/app/src/main/AndroidManifest.xml).

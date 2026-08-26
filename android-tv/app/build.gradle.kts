import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing is OPTIONAL. Sideloading needs *a* signature, not a
// trusted one, so a missing keystore falls back to the debug key and
// `assembleRelease` still produces an installable APK. Supply a real one
// (keystore.properties, or the HALCYON_TV_KEYSTORE* env vars CI uses) when
// you want upgrades to install over an earlier build: Android refuses to
// replace an APK whose signing key changed, and the debug key differs from
// machine to machine. See README.md, "Signing".
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(prop: String, env: String): String? =
    keystoreProps.getProperty(prop) ?: System.getenv(env)

val storeFilePath = secret("storeFile", "HALCYON_TV_KEYSTORE")
val hasReleaseKey = storeFilePath != null && rootProject.file(storeFilePath).exists()

android {
    namespace = "video.halcyon.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "video.halcyon.tv"
        // Android 7.0. Fire OS 6 (Fire TV Stick 4K) is API 25 and Google TV is
        // API 34, so this covers every box the store is aimed at while
        // guaranteeing a WebView new enough for the viewer's WebRTC stack.
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = rootProject.file(storeFilePath!!)
                storePassword = secret("storePassword", "HALCYON_TV_KEYSTORE_PASSWORD")
                keyAlias = secret("keyAlias", "HALCYON_TV_KEY_ALIAS")
                keyPassword = secret("keyPassword", "HALCYON_TV_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    // Deliberately thin: the wrapper is an Activity and a WebView. No
    // leanback/androidx-tv UI library — the store's own page is the UI, and
    // every dependency here is one more thing to audit in a public repo.
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.core:core-ktx:1.12.0")

    // StoreAddress is deliberately free of Android types in its parsing half
    // so the address box can be tested on a plain JVM: `gradle test`.
    testImplementation("junit:junit:4.13.2")
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Firma release da variabili d'ambiente (impostate dalla CI tramite GitHub Secrets).
// In locale, se mancano, la build release resta non firmata.
val ksFile = System.getenv("TT_KEYSTORE_FILE")
val ksPass = System.getenv("TT_KEYSTORE_PASSWORD")
val ksAlias = System.getenv("TT_KEY_ALIAS") ?: "trovatelefono"
val hasSigning = !ksFile.isNullOrBlank() && !ksPass.isNullOrBlank() && file(ksFile).exists()

android {
    namespace = "it.lazzaro.trovatelefono"
    compileSdk = 35

    defaultConfig {
        applicationId = "it.lazzaro.trovatelefono"
        minSdk = 31
        targetSdk = 35
        versionCode = (System.getenv("TT_VERSION_CODE") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("TT_VERSION_CODE") ?: "0")
    }

    signingConfigs {
        if (hasSigning) {
            create("release") {
                storeFile = file(ksFile!!)
                storePassword = ksPass
                keyAlias = ksAlias
                keyPassword = ksPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasSigning) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
}

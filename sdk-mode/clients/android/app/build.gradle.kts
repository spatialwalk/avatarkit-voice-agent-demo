import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}

fun readConfig(key: String, fallback: String = ""): String {
    return (localProperties.getProperty(key) ?: System.getenv(key) ?: fallback).trim()
}

fun escapeBuildConfig(value: String): String {
    return value.replace("\\", "\\\\").replace("\"", "\\\"")
}

fun quote(value: String): String = "\"${escapeBuildConfig(value)}\""

fun boolLiteral(value: String): String = if (value.equals("true", ignoreCase = true)) "true" else "false"

val spatialrealAppId = readConfig("SPATIALREAL_APP_ID")
val spatialrealAvatarId = readConfig("SPATIALREAL_AVATAR_ID", "93dd60f8-d9e2-47cf-973e-d75e10cfc951")
val spatialrealEnvironment = readConfig("SPATIALREAL_ENVIRONMENT", "intl")

val openAiApiKey = readConfig("OPENAI_API_KEY")
val openAiBaseUrl = readConfig("OPENAI_BASE_URL", "https://api.openai.com")
val openAiUseProxy = readConfig("OPENAI_USE_PROXY", "false")
val openAiProxyBaseUrl = readConfig("OPENAI_PROXY_BASE_URL", "http://10.0.2.2:8090")
val openAiModel = readConfig("OPENAI_MODEL", "gpt-4o-mini")
val openAiSttModel = readConfig("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe")
val openAiSttLanguage = readConfig("OPENAI_STT_LANGUAGE", "en")
val openAiTtsModel = readConfig("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
val openAiTtsVoice = readConfig("OPENAI_TTS_VOICE", "alloy")

val vadStartThreshold = readConfig("VAD_START_THRESHOLD", "0.03")
val vadStopThreshold = readConfig("VAD_STOP_THRESHOLD", "0.02")
val vadSilenceMs = readConfig("VAD_SILENCE_MS", "700")
val vadMinSpeechMs = readConfig("VAD_MIN_SPEECH_MS", "280")
val vadMaxSpeechMs = readConfig("VAD_MAX_SPEECH_MS", "8000")
val micSampleRate = readConfig("MIC_SAMPLE_RATE", "16000")

android {
    namespace = "ai.spatialwalk.sdkmodeexample"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.spatialwalk.sdkmodeexample"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk {
            abiFilters += listOf("arm64-v8a")
        }

        buildConfigField("String", "SPATIALREAL_APP_ID", quote(spatialrealAppId))
        buildConfigField("String", "SPATIALREAL_AVATAR_ID", quote(spatialrealAvatarId))
        buildConfigField("String", "SPATIALREAL_ENVIRONMENT", quote(spatialrealEnvironment))

        buildConfigField("String", "OPENAI_API_KEY", quote(openAiApiKey))
        buildConfigField("String", "OPENAI_BASE_URL", quote(openAiBaseUrl))
        buildConfigField("boolean", "OPENAI_USE_PROXY", boolLiteral(openAiUseProxy))
        buildConfigField("String", "OPENAI_PROXY_BASE_URL", quote(openAiProxyBaseUrl))
        buildConfigField("String", "OPENAI_MODEL", quote(openAiModel))
        buildConfigField("String", "OPENAI_STT_MODEL", quote(openAiSttModel))
        buildConfigField("String", "OPENAI_STT_LANGUAGE", quote(openAiSttLanguage))
        buildConfigField("String", "OPENAI_TTS_MODEL", quote(openAiTtsModel))
        buildConfigField("String", "OPENAI_TTS_VOICE", quote(openAiTtsVoice))

        buildConfigField("double", "VAD_START_THRESHOLD", vadStartThreshold)
        buildConfigField("double", "VAD_STOP_THRESHOLD", vadStopThreshold)
        buildConfigField("int", "VAD_SILENCE_MS", vadSilenceMs)
        buildConfigField("int", "VAD_MIN_SPEECH_MS", vadMinSpeechMs)
        buildConfigField("int", "VAD_MAX_SPEECH_MS", vadMaxSpeechMs)
        buildConfigField("int", "MIC_SAMPLE_RATE", micSampleRate)
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("ai.spatialwalk:avatarkit:1.0.0-beta36")

    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
    implementation("androidx.activity:activity-compose:1.12.1")

    implementation(platform("androidx.compose:compose-bom:2025.12.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.foundation:foundation")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

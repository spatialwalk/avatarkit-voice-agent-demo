plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val localProps = rootProject.file("local.properties")
    .takeIf { it.exists() }
    ?.readLines()
    ?.filter { it.contains("=") && !it.trimStart().startsWith("#") }
    ?.associate { it.substringBefore("=").trim() to it.substringAfter("=").trim() }
    ?: emptyMap()

fun localProp(key: String, default: String = ""): String = localProps[key] ?: default

android {
    namespace = "ai.spatialwalk.avatarkitdemo"
    compileSdk {
        version = release(36)
    }

    defaultConfig {
        applicationId = "ai.spatialwalk.avatarkitdemo"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // SpatialReal
        buildConfigField("String", "SPATIALREAL_APP_ID", "\"${localProp("SPATIALREAL_APP_ID")}\"")
        buildConfigField("String", "SPATIALREAL_AVATAR_ID", "\"${localProp("SPATIALREAL_AVATAR_ID")}\"")
        buildConfigField("String", "SPATIALREAL_ENVIRONMENT", "\"${localProp("SPATIALREAL_ENVIRONMENT", "intl")}\"")

        // OpenAI
        buildConfigField("String", "OPENAI_API_KEY", "\"${localProp("OPENAI_API_KEY")}\"")
        buildConfigField("String", "OPENAI_BASE_URL", "\"${localProp("OPENAI_BASE_URL", "https://api.openai.com")}\"")
        buildConfigField("boolean", "OPENAI_USE_PROXY", localProp("OPENAI_USE_PROXY", "false"))
        buildConfigField("String", "OPENAI_PROXY_BASE_URL", "\"${localProp("OPENAI_PROXY_BASE_URL")}\"")
        buildConfigField("String", "OPENAI_MODEL", "\"${localProp("OPENAI_MODEL", "gpt-4o-mini")}\"")
        buildConfigField("String", "OPENAI_STT_MODEL", "\"${localProp("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe")}\"")
        buildConfigField("String", "OPENAI_STT_LANGUAGE", "\"${localProp("OPENAI_STT_LANGUAGE", "en")}\"")
        buildConfigField("String", "OPENAI_TTS_MODEL", "\"${localProp("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")}\"")
        buildConfigField("String", "OPENAI_TTS_VOICE", "\"${localProp("OPENAI_TTS_VOICE", "alloy")}\"")

        // VAD
        buildConfigField("int", "MIC_SAMPLE_RATE", localProp("MIC_SAMPLE_RATE", "16000"))
        buildConfigField("double", "VAD_START_THRESHOLD", localProp("VAD_START_THRESHOLD", "0.02"))
        buildConfigField("double", "VAD_STOP_THRESHOLD", localProp("VAD_STOP_THRESHOLD", "0.014"))
        buildConfigField("int", "VAD_SILENCE_MS", localProp("VAD_SILENCE_MS", "700"))
        buildConfigField("int", "VAD_MIN_SPEECH_MS", localProp("VAD_MIN_SPEECH_MS", "280"))
        buildConfigField("int", "VAD_MAX_SPEECH_MS", localProp("VAD_MAX_SPEECH_MS", "30000"))
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
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.avatarkit)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.navigation.compose)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
    }
}

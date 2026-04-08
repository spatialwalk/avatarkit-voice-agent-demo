package ai.spatialwalk.avatarkit.hostdemo

import ai.spatialwalk.avatarkit.Environment
import ai.spatialwalk.avatarkit.hostdemo.ui.screens.ConfigCheckScreen
import ai.spatialwalk.avatarkit.hostdemo.ui.screens.PlaygroundScreen
import ai.spatialwalk.avatarkit.hostdemo.ui.theme.AvatarKitHostDemoTheme
import ai.spatialwalk.avatarkit.hostdemo.viewmodel.AvatarViewModel
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

class MainActivity : ComponentActivity() {

    private val viewModel: AvatarViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AvatarKitHostDemoTheme {
                val navController = rememberNavController()
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = "config_check",
                        modifier = Modifier.padding(innerPadding),
                    ) {
                        composable("config_check") {
                            ConfigCheckScreen(
                                onReady = { appId, environment ->
                                    val env = if (environment == "cn") Environment.cn else Environment.intl
                                    viewModel.initialize(appId, env)
                                    navController.navigate("playground") {
                                        popUpTo("config_check") { inclusive = true }
                                    }
                                },
                            )
                        }
                        composable("playground") {
                            PlaygroundScreen(viewModel = viewModel)
                        }
                    }
                }
            }
        }
    }
}

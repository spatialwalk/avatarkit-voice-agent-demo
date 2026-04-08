package ai.spatialwalk.avatarkitdemo

import ai.spatialwalk.avatarkit.DrivingServiceMode
import ai.spatialwalk.avatarkitdemo.ui.screens.ConfigScreen
import ai.spatialwalk.avatarkitdemo.ui.screens.PlaygroundScreen
import ai.spatialwalk.avatarkitdemo.ui.theme.AvatarKitDemoTheme
import ai.spatialwalk.avatarkitdemo.viewmodel.AvatarViewModel
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
        viewModel.mode = DrivingServiceMode.SDK
        enableEdgeToEdge()
        setContent {
            AvatarKitDemoTheme {
                val navController = rememberNavController()
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = "config",
                        modifier = Modifier.padding(innerPadding),
                    ) {
                        composable("config") {
                            ConfigScreen(
                                viewModel = viewModel,
                                onInitialized = {
                                    navController.navigate("playground")
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

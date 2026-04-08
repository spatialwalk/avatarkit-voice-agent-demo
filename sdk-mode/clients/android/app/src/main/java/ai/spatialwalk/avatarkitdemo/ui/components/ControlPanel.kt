package ai.spatialwalk.avatarkitdemo.ui.components

import ai.spatialwalk.avatarkit.AvatarController.ConnectionState
import ai.spatialwalk.avatarkit.performance.FrameRateMonitor.FrameRateInfo
import ai.spatialwalk.avatarkit.player.AnimationPlayer.ConversationState
import ai.spatialwalk.avatarkitdemo.viewmodel.AvatarViewModel
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import java.io.File

@Composable
fun SdkControlPanel(
    viewModel: AvatarViewModel,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val pcmFiles = remember {
        context.assets.list("pcm")?.toList().orEmpty().map { "pcm/$it" }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val isConnected = viewModel.connectionState == ConnectionState.Connected
            Button(
                onClick = { if (isConnected) viewModel.disconnect() else viewModel.connect() },
                enabled = viewModel.connectionState != ConnectionState.Connecting,
                modifier = Modifier.weight(1f),
            ) {
                Text(if (isConnected) "Disconnect" else "Connect")
            }
            OutlinedButton(
                onClick = { viewModel.interrupt() },
                enabled = viewModel.conversationState == ConversationState.Playing,
                modifier = Modifier.weight(1f),
            ) {
                Text("Interrupt")
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("Audio Files", style = MaterialTheme.typography.labelLarge)
        pcmFiles.forEach { file ->
            ListItem(
                headlineContent = { Text(File(file).name) },
                modifier = Modifier.clickable { viewModel.sendPcm(file) },
            )
        }
        Spacer(Modifier.height(12.dp))
        StatusDisplay(viewModel, showConnection = true)
    }
}

@Composable
fun StatusDisplay(
    viewModel: AvatarViewModel,
    showConnection: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        PerformanceInfo(viewModel.frameRateInfo)
        Spacer(Modifier.height(8.dp))
        if (showConnection) {
            Text("Connection: ${viewModel.connectionState}", style = MaterialTheme.typography.bodyMedium)
        }
        Text("Conversation: ${viewModel.conversationState}", style = MaterialTheme.typography.bodyMedium)
        if (viewModel.extraMessage.isNotEmpty()) {
            Text("Message: ${viewModel.extraMessage}", style = MaterialTheme.typography.bodySmall)
        }
        viewModel.errorState?.let {
            Text(
                "Error: ${it.message}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
fun PerformanceInfo(info: FrameRateInfo, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text("FPS: %.1f".format(info.fps))
        Text("Frame time: %.2f ms".format(info.averageFrameTimeMs))
    }
}

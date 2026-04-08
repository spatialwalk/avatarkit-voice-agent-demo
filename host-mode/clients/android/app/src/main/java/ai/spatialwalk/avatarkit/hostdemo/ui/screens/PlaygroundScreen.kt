package ai.spatialwalk.avatarkit.hostdemo.ui.screens

import ai.spatialwalk.avatarkit.AvatarView
import ai.spatialwalk.avatarkit.hostdemo.data.AvatarCharacter
import ai.spatialwalk.avatarkit.hostdemo.data.defaultCharacters
import ai.spatialwalk.avatarkit.hostdemo.viewmodel.AvatarViewModel
import android.content.Intent
import android.net.Uri
import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

@Composable
fun PlaygroundScreen(
    viewModel: AvatarViewModel,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var selectedCharacterId by remember { mutableStateOf("") }
    var customId by remember { mutableStateOf("") }
    var showCustomInput by remember { mutableStateOf(false) }
    var isLoadingAvatar by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> {}
                Lifecycle.Event.ON_RESUME -> {}
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            viewModel.cleanupAvatar()
        }
    }

    fun loadCharacter(id: String) {
        selectedCharacterId = id
        isLoadingAvatar = true
        loadError = null
        viewModel.loadAvatar(id)
    }

    Column(modifier = modifier.fillMaxSize()) {
        // 1. Avatar view
        if (viewModel.currentAvatarId.isNotEmpty()) {
            if (viewModel.isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .background(Color.Black),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = Color.White)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "${(viewModel.loadProgress * 100).toInt()}%",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            } else {
                AndroidView(
                    factory = { ctx ->
                        AvatarView(ctx).also { viewModel.onAvatarViewCreated(it) }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f),
                )
                if (isLoadingAvatar) {
                    isLoadingAvatar = false
                }
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .background(Color.Black),
                contentAlignment = Alignment.Center,
            ) {
                Text("Select a character below", color = Color.Gray)
            }
        }

        // 2. Status bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.Center,
        ) {
            Text(
                "Server: ${if (viewModel.hostConnected) "connected" else if (viewModel.hostConnecting) "connecting..." else "disconnected"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(16.dp))
            Text(
                "Conv: ${viewModel.conversationState}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // Error message
        viewModel.errorState?.let { error ->
            Text(
                text = error.message ?: "Unknown error",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }

        // 3. Control buttons
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.Center,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!viewModel.hostConnected) {
                    Button(
                        onClick = { viewModel.hostConnect() },
                        enabled = !viewModel.hostConnecting,
                    ) {
                        Text(if (viewModel.hostConnecting) "Connecting..." else "Connect")
                    }
                } else {
                    OutlinedButton(onClick = { viewModel.hostDisconnect() }) {
                        Text("Disconnect")
                    }
                }
                OutlinedButton(onClick = {
                    if (viewModel.isPaused) viewModel.resume() else viewModel.pause()
                }) {
                    Text(if (viewModel.isPaused) "Resume" else "Pause")
                }
                OutlinedButton(onClick = { viewModel.interrupt() }) {
                    Text("Interrupt")
                }
            }
        }

        HorizontalDivider()

        // 4. Two-column: left = characters, right = host controls
        Row(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            // Left column: character list
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
                    .padding(top = 8.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        "Characters",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "IDs",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clickable {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse("https://dash.spatialreal.ai"))
                            )
                        },
                    )
                }
                Spacer(Modifier.height(4.dp))

                defaultCharacters.forEach { character ->
                    CharacterItem(
                        character = character,
                        isSelected = selectedCharacterId == character.id,
                        isLoading = isLoadingAvatar && selectedCharacterId == character.id,
                        hasAvatar = selectedCharacterId == character.id && viewModel.currentAvatarId == character.id && !viewModel.isLoading,
                        loadProgress = viewModel.loadProgress,
                        onClick = { loadCharacter(character.id) },
                        enabled = !isLoadingAvatar,
                    )
                }

                // Custom ID
                if (showCustomInput) {
                    Column(modifier = Modifier.padding(horizontal = 12.dp)) {
                        OutlinedTextField(
                            value = customId,
                            onValueChange = { customId = it },
                            label = { Text("Character ID", fontSize = 12.sp) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            textStyle = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Button(
                                onClick = {
                                    val id = customId.trim()
                                    if (id.isNotEmpty()) loadCharacter(id)
                                },
                                enabled = customId.trim().isNotEmpty() && !isLoadingAvatar,
                            ) {
                                Text("Load", fontSize = 12.sp)
                            }
                            OutlinedButton(onClick = {
                                showCustomInput = false
                                customId = ""
                            }) {
                                Text("Cancel", fontSize = 12.sp)
                            }
                        }
                    }
                } else {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showCustomInput = true }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(26.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("+", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Custom ID",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                loadError?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    )
                }
            }

            // Vertical divider
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(1.dp)
                    .background(MaterialTheme.colorScheme.outlineVariant),
            )

            // Right column: host controls
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
                    .padding(top = 8.dp),
            ) {
                HostControlPanel(viewModel)
            }
        }
    }
}

@Composable
private fun CharacterItem(
    character: AvatarCharacter,
    isSelected: Boolean,
    isLoading: Boolean,
    hasAvatar: Boolean,
    loadProgress: Float,
    onClick: () -> Unit,
    enabled: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(26.dp)
                .clip(CircleShape)
                .background(Color(0xFF2196F3)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = character.name.first().toString(),
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            text = character.name,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f),
        )
        if (isLoading) {
            Text(
                "${(loadProgress * 100).toInt()}%",
                fontSize = 12.sp,
                color = Color(0xFF2196F3),
                fontWeight = FontWeight.SemiBold,
            )
        } else if (hasAvatar) {
            Text("\u2705", fontSize = 12.sp)
        }
    }
}

@Composable
private fun HostControlPanel(viewModel: AvatarViewModel) {
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            viewModel.hostStartMic()
        }
    }

    Text(
        "Microphone",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 12.dp),
    )
    Spacer(Modifier.height(4.dp))

    if (viewModel.hostMicActive) {
        Button(
            onClick = { viewModel.hostStopMic() },
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
        ) {
            Text("Stop Mic")
        }
    } else {
        Button(
            onClick = {
                if (viewModel.hasRecordPermission()) {
                    if (!viewModel.hostConnected) {
                        viewModel.hostConnect()
                    }
                    viewModel.hostStartMic()
                } else {
                    permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            },
            enabled = viewModel.currentAvatarId.isNotEmpty(),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
        ) {
            Text("Start Mic")
        }
    }

    Spacer(Modifier.height(12.dp))

    Text(
        "Text Input",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 12.dp),
    )
    Spacer(Modifier.height(4.dp))

    OutlinedTextField(
        value = viewModel.hostTextInput,
        onValueChange = { viewModel.hostTextInput = it },
        placeholder = { Text("Type a message...", fontSize = 12.sp) },
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp),
        textStyle = MaterialTheme.typography.bodySmall,
    )
    Spacer(Modifier.height(4.dp))

    Button(
        onClick = {
            if (!viewModel.hostConnected) {
                viewModel.hostConnect()
            }
            viewModel.hostSendText(viewModel.hostTextInput)
        },
        enabled = viewModel.hostTextInput.trim().isNotEmpty() && viewModel.currentAvatarId.isNotEmpty(),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp),
    ) {
        Text("Send")
    }

    Spacer(Modifier.height(12.dp))
    Text(
        text = "Server: ${ai.spatialwalk.avatarkit.hostdemo.BuildConfig.HOST_SERVER_URL}\nUsing hostmode-demo backend.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 12.dp),
    )
}

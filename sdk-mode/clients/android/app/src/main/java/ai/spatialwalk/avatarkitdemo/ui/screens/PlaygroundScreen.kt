package ai.spatialwalk.avatarkitdemo.ui.screens

import ai.spatialwalk.avatarkit.AvatarController.ConnectionState
import ai.spatialwalk.avatarkit.AvatarView
import ai.spatialwalk.avatarkit.player.AnimationPlayer.ConversationState
import ai.spatialwalk.avatarkitdemo.data.AvatarInfo
import ai.spatialwalk.avatarkitdemo.data.defaultCharacters
import ai.spatialwalk.avatarkitdemo.viewmodel.AvatarViewModel
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
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
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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
    val context = androidx.compose.ui.platform.LocalContext.current
    var selectedCharacterId by remember { mutableStateOf("") }
    var customId by remember { mutableStateOf("") }
    var showCustomInput by remember { mutableStateOf(false) }
    var isLoadingAvatar by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> viewModel.onPause()
                Lifecycle.Event.ON_RESUME -> viewModel.onResume()
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
                    update = { /* no-op, view is managed by viewModel */ },
                )
                // Track loading state
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
                "Connection: ${viewModel.connectionState}",
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
            val isConnected = viewModel.connectionState == ConnectionState.Connected
            Button(
                onClick = { viewModel.connect() },
                enabled = !isConnected && viewModel.connectionState != ConnectionState.Connecting,
            ) {
                Text("Start")
            }
            Spacer(Modifier.width(8.dp))
            OutlinedButton(onClick = { viewModel.interrupt() }) {
                Text("Interrupt")
            }
            Spacer(Modifier.width(8.dp))
            OutlinedButton(
                onClick = { viewModel.disconnect() },
                enabled = isConnected,
            ) {
                Text("Close")
            }
        }

        Divider()

        // 4. Two-column: left = characters, right = audio files
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
                // Header
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
                                android.content.Intent(
                                    android.content.Intent.ACTION_VIEW,
                                    android.net.Uri.parse("https://dash.spatialreal.ai")
                                )
                            )
                        },
                    )
                }
                Spacer(Modifier.height(4.dp))

                // Character items
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

                // Load error
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

            // Right column: audio files
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
                    .padding(top = 8.dp),
            ) {
                SdkRightPanel(viewModel)
            }
        }
    }
}

@Composable
private fun CharacterItem(
    character: AvatarInfo,
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
            Text("OK", fontSize = 12.sp)
        }
    }
}

@Composable
private fun SdkRightPanel(viewModel: AvatarViewModel) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val pcmFiles = remember {
        context.assets.list("pcm")?.toList().orEmpty().map { "pcm/$it" }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            "Audio Files",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (viewModel.isSendingAudio) {
            CircularProgressIndicator(
                modifier = Modifier.size(14.dp),
                strokeWidth = 2.dp,
            )
        }
    }
    Spacer(Modifier.height(4.dp))

    pcmFiles.forEach { file ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = !viewModel.isSendingAudio) { viewModel.sendPcm(file) }
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("~", fontSize = 12.sp)
            Spacer(Modifier.width(6.dp))
            Text(
                text = file.removePrefix("pcm/"),
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (viewModel.currentlyPlayingFile == file) {
                Text(">>", fontSize = 12.sp)
            }
        }
    }
}

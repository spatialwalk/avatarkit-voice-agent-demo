package ai.spatialwalk.avatarkitdemo.ui.screens

import ai.spatialwalk.avatarkit.Environment
import ai.spatialwalk.avatarkitdemo.R
import ai.spatialwalk.avatarkitdemo.viewmodel.AvatarViewModel
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp

@Composable
fun ConfigScreen(
    viewModel: AvatarViewModel,
    onInitialized: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        Text(
            text = "SDK Mode Configuration",
            style = MaterialTheme.typography.headlineSmall,
        )
        Spacer(Modifier.height(16.dp))

        // Guide image
        Image(
            painter = painterResource(R.drawable.api_key_guide),
            contentDescription = "API Key Guide",
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .clickable {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("https://dash.spatialreal.ai"))
                    )
                },
        )
        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = viewModel.appId,
            onValueChange = { viewModel.appId = it },
            label = { Text("App ID") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = viewModel.sessionToken,
            onValueChange = { viewModel.sessionToken = it },
            label = { Text("Session Token") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        Text(
            text = "Environment",
            style = MaterialTheme.typography.labelLarge,
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = viewModel.environment == Environment.intl,
                onClick = { viewModel.environment = Environment.intl },
                label = { Text("International") },
            )
            FilterChip(
                selected = viewModel.environment == Environment.cn,
                onClick = { viewModel.environment = Environment.cn },
                label = { Text("China") },
            )
        }

        Spacer(Modifier.height(32.dp))

        Button(
            onClick = {
                viewModel.initialize()
                onInitialized()
            },
            enabled = viewModel.appId.isNotBlank() && viewModel.sessionToken.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Initialize")
        }
    }
}

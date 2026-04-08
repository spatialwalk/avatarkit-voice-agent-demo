# Vanilla JS Example

This is an AvatarKit SDK example using native JavaScript, demonstrating how to integrate the SDK without using any framework.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Navigate to vanilla example directory
cd vanilla

# Install dependencies
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

### 3. Access Example

Open browser and visit: `http://localhost:5178`

## 📋 Features

- ✅ SDK initialization
- ✅ Avatar loading (with progress display)
- ✅ WebSocket connection management
- ✅ Real-time audio recording and sending
- ✅ Real-time animation rendering
- ✅ Conversation interruption (supports interruption in both network and external data modes)
- ✅ Log panel (real-time status display)
- ✅ SDK Mode: Real-time audio streaming via WebSocket
- ✅ Host Mode: App-provided audio and animation playback (the demo uses pre-generated data and requires server-side SDK for keyframe generation in production)

## 🎯 Use Cases

- Rapid prototyping
- Framework-independent projects
- Learning basic SDK usage
- Reference for other framework examples

## 🔧 Tech Stack

- **Native JavaScript** (ES Modules)
- **Vite** - Development server and build tool

## 📖 Code Explanation

### Usage Example

The code uses a modular design, with the main entry point in `src/js/app.js`:

```javascript
// src/js/app.js
import { Logger, updateStatus } from './logger.js'
import { AudioRecorder } from './audioRecorder.js'
import { AvatarSDKManager } from './avatarSDK.js'

// Initialize application
const app = new App()
```

### Key Modules

#### 1. SDK Management (`src/js/avatarSDK.js`)

```javascript
const sdkManager = new AvatarSDKManager(logger)

// Initialize SDK
await sdkManager.initialize(environment, sessionToken)

// Load avatar
await sdkManager.loadAvatar(avatarId, canvasContainer, callbacks)

// Connect service
await sdkManager.connect()
```

#### 2. Audio Recording (`src/js/audioRecorder.js`)

```javascript
const audioRecorder = new AudioRecorder()

// Start recording
await audioRecorder.start()

// Stop recording and get processed audio data
const audioBuffer = await audioRecorder.stop()
```

#### 3. Logging System (`src/js/logger.js`)

```javascript
const logger = new Logger(logPanel)

logger.info('Info')
logger.success('Success')
logger.warning('Warning')
logger.error('Error')
```

### Code Flow

1. **Initialization Phase** - `App` class creates instance, loads SDK
2. **User Interaction** - Handle button clicks through event listeners
3. **SDK Operations** - Manage SDK through `AvatarSDKManager` wrapper class
4. **Audio Processing** - Handle recording and audio format conversion through `AudioRecorder` class
5. **Status Updates** - Update UI through `Logger` and `updateStatus`

## 🔑 Configuration

### Environment Configuration

- **`intl`** - International production environment (default)
- **`cn`** - China production environment

### Session Token (Required)

**All environments now require a Session Token for authentication.**

**Quick Setup:**
1. Click the **"Auto"** button next to the "Session Token" input field
2. The button will generate a temporary token valid for 1 hour
3. The token will be automatically filled into the input field
4. **Important**: Generate the token **before** initializing the SDK, so it will be automatically set during initialization
5. If SDK is already initialized, the token will be set immediately when generated

**Manual Entry:**
- You can also manually enter a Session Token if you have one
- The token must be valid and not expired

### Avatar ID

Get avatar ID from SDK management platform to load the specified virtual avatar.

## 📁 Project Structure

```
vanilla/
├── demo.html              # Main demo page (HTML structure)
├── index.html             # Entry page
├── package.json           # Dependencies
├── vite.config.ts         # Vite configuration
├── src/
│   ├── styles/
│   │   └── main.css       # Styles
│   ├── js/
│   │   ├── app.js         # Main application logic
│   │   ├── logger.js      # Logging system
│   │   ├── audioRecorder.js # Audio recording functionality
│   │   └── avatarSDK.js   # SDK wrapper
│   └── utils/
│       └── audioUtils.js  # Audio processing utilities
└── README.md              # This file
```

### Code Structure Explanation

The code is organized following separation of concerns:

- **`demo.html`** - Contains only HTML structure, references external CSS and JS
- **`src/styles/main.css`** - All style definitions
- **`src/js/app.js`** - Main application class, integrates all modules, handles user interaction
- **`src/js/logger.js`** - Logging system and status update utilities
- **`src/js/audioRecorder.js`** - Audio recording functionality encapsulation
- **`src/js/avatarSDK.js`** - SDK initialization and management wrapper
- **`src/utils/audioUtils.js`** - Audio processing utility functions (resampling, format conversion, etc.)

This structure makes the code:
- ✅ Easy to maintain (each file has a single responsibility)
- ✅ Easy to test (functional modules are independent)
- ✅ Easy to extend (adding new features only requires new modules)
- ✅ Follows best practices (separation of concerns)

## ⚠️ Notes

- Requires browser support for Web Audio API, WebSocket, and WASM
- Requires user authorization for microphone permission
- Recommended to use HTTPS or localhost (required by some browsers)
- Ensure `@spatialwalk/avatarkit` SDK is installed: `npm install @spatialwalk/avatarkit`
- **Host Mode**: Requires the Avatar digital human server-side SDK to generate animation keyframes from audio. The example uses pre-generated data files for demonstration. In production, you must integrate with the server-side SDK.

## 🔍 View Code

The code is modularized, main files:

- **`src/js/app.js`** - Main application logic, integrates all modules
- **`src/js/avatarSDK.js`** - SDK wrapper, handles initialization and avatar management
- **`src/js/audioRecorder.js`** - Audio recording and processing
- **`src/js/logger.js`** - Log and status management
- **`src/utils/audioUtils.js`** - Audio utility functions

Each module has clear responsibilities, making it easy to understand and maintain. Check the source code for specific implementation details.

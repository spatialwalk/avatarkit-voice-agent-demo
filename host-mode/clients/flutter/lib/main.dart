import 'package:flutter/material.dart';

import 'config_check_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AvatarHostDemoApp());
}

class AvatarHostDemoApp extends StatelessWidget {
  const AvatarHostDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AvatarKit Host Demo',
      theme: ThemeData(
        colorSchemeSeed: Colors.blue,
        useMaterial3: true,
      ),
      home: const ConfigCheckPage(),
    );
  }
}

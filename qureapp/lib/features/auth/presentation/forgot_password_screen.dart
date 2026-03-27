import 'package:flutter/material.dart';

class ForgotPasswordScreen extends StatelessWidget {
  const ForgotPasswordScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot password')),
      body: const Padding(
        padding: EdgeInsets.all(20),
        child: Text(
          'Placeholder screen.\n\nWe can wire this to the backend password reset flow next.',
        ),
      ),
    );
  }
}


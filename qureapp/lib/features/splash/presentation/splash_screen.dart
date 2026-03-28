import 'package:flutter/material.dart';

/// Matches native splash from [flutter_native_splash] (white + centered logo).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  static const Color _kPrimaryBlue = Color(0xFF0B3F9A);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              'assets/images/splash_brand_logo.png',
              width: 132,
              height: 132,
              filterQuality: FilterQuality.medium,
            ),
            const SizedBox(height: 36),
            const SizedBox(
              width: 30,
              height: 30,
              child: CircularProgressIndicator(
                strokeWidth: 2.8,
                color: _kPrimaryBlue,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

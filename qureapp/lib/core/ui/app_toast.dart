import 'package:another_flushbar/flushbar.dart';
import 'package:flutter/material.dart';

class AppToast {
  static Future<void> showSuccess(
    BuildContext context, {
    required String message,
    String? title,
  }) =>
      _show(
        context,
        message: message,
        title: title,
        backgroundColor: const Color(0xFF0E7A43),
        icon: Icons.check_circle,
      );

  static Future<void> showError(
    BuildContext context, {
    required String message,
    String? title,
  }) =>
      _show(
        context,
        message: message,
        title: title,
        backgroundColor: const Color(0xFFB42318),
        icon: Icons.error,
      );

  static Future<void> showInfo(
    BuildContext context, {
    required String message,
    String? title,
  }) =>
      _show(
        context,
        message: message,
        title: title,
        backgroundColor: const Color(0xFF155EEF),
        icon: Icons.info,
      );

  static Future<void> _show(
    BuildContext context, {
    required String message,
    required Color backgroundColor,
    required IconData icon,
    String? title,
  }) async {
    await Flushbar<void>(
      title: title,
      message: message,
      duration: const Duration(seconds: 3),
      backgroundColor: backgroundColor,
      icon: Icon(icon, color: Colors.white),
      margin: const EdgeInsets.all(16),
      borderRadius: BorderRadius.circular(12),
      flushbarPosition: FlushbarPosition.TOP,
    ).show(context);
  }
}


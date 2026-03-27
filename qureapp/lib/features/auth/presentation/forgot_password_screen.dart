import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/branding/qure_brand_mark.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_toast.dart';
import '../data/auth_password_api.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  bool _isValidEmail(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return false;
    }
    final emailPattern = RegExp(
      r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
    );
    return emailPattern.hasMatch(trimmed);
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) {
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      final api = ref.read(authPasswordApiProvider);
      final message = await api.requestPasswordReset(
        email: _emailController.text.trim(),
      );
      if (!mounted) {
        return;
      }
      await AppToast.showSuccess(context, message: message);
    } on ApiException catch (e) {
      if (!mounted) {
        return;
      }
      await AppToast.showError(context, message: e.message);
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final topPadding = mediaQuery.padding.top;

    return Scaffold(
      body: SizedBox.expand(
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF0B3F9A), Color(0xFF08307A)],
            ),
          ),
          child: SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return Stack(
                  children: [
                    Align(
                      alignment: Alignment.center,
                      child: SingleChildScrollView(
                        padding: EdgeInsets.fromLTRB(
                          18,
                          topPadding > 0 ? 10 : 22,
                          18,
                          84,
                        ),
                        child: Form(
                          key: _formKey,
                          child: Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 520),
                              child: _ForgotPasswordCard(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Row(
                                      children: const [
                                        QureBrandMarkAuth(),
                                        Spacer(),
                                      ],
                                    ),
                                    const SizedBox(height: 22),
                                    const Text(
                                      'Forgot Password?',
                                      style: TextStyle(
                                        fontSize: 34,
                                        height: 1.05,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white,
                                        letterSpacing: -0.4,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Text(
                                      'Enter your email to reset your password',
                                      style: TextStyle(
                                        fontSize: 14.5,
                                        height: 1.35,
                                        color: Colors.white.withValues(
                                          alpha: 0.80,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 18),
                                    _FigmaTextField(
                                      controller: _emailController,
                                      label: '',
                                      hintText: 'Enter your registered email.',
                                      keyboardType: TextInputType.emailAddress,
                                      textInputAction: TextInputAction.done,
                                      validator: (value) {
                                        final input = (value ?? '').trim();
                                        if (input.isEmpty) {
                                          return 'Email is required';
                                        }
                                        if (!_isValidEmail(input)) {
                                          return 'Enter a valid email address';
                                        }
                                        return null;
                                      },
                                      onFieldSubmitted: _isSubmitting
                                          ? null
                                          : (_) => _submit(),
                                    ),
                                    const SizedBox(height: 18),
                                    SizedBox(
                                      height: 46,
                                      child: FilledButton(
                                        style: FilledButton.styleFrom(
                                          backgroundColor: const Color(
                                            0xFF0B2E7A,
                                          ),
                                          foregroundColor: Colors.white,
                                          shape: RoundedRectangleBorder(
                                            borderRadius:
                                                BorderRadius.circular(14),
                                          ),
                                        ),
                                        onPressed:
                                            _isSubmitting ? null : _submit,
                                        child: _isSubmitting
                                            ? const SizedBox(
                                                height: 18,
                                                width: 18,
                                                child:
                                                    CircularProgressIndicator(
                                                      strokeWidth: 2,
                                                      color: Colors.white,
                                                    ),
                                              )
                                            : const Text(
                                                'Send Reset Link',
                                                style: TextStyle(
                                                  fontSize: 15,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    Align(
                                      alignment: Alignment.center,
                                      child: InkWell(
                                        onTap: _isSubmitting
                                            ? null
                                            : () => context.go('/login'),
                                        child: Text(
                                          'Back to Login',
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            fontSize: 14.5,
                                            color: Colors.white.withValues(
                                              alpha: 0.92,
                                            ),
                                            fontWeight: FontWeight.w500,
                                            decoration: TextDecoration.none,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.bottomCenter,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '© 2025 Qure Nigeria. All rights reserved.',
                              style: TextStyle(
                                fontSize: 11.5,
                                color: Colors.white.withValues(alpha: 0.55),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                _FooterLink(
                                  label: 'Privacy Policy',
                                  onTap: () => AppToast.showInfo(
                                    context,
                                    message:
                                        'Privacy Policy screen will be added next.',
                                  ),
                                ),
                                _FooterDot(
                                  color: Colors.white.withValues(alpha: 0.55),
                                ),
                                _FooterLink(
                                  label: 'Terms of Service',
                                  onTap: () => context.push('/terms'),
                                ),
                                _FooterDot(
                                  color: Colors.white.withValues(alpha: 0.55),
                                ),
                                _FooterLink(
                                  label: 'Cookie Settings',
                                  onTap: () => AppToast.showInfo(
                                    context,
                                    message:
                                        'Cookie settings are not used in the mobile app.',
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _ForgotPasswordCard extends StatelessWidget {
  const _ForgotPasswordCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.22),
          width: 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 18, 22, 22),
        child: child,
      ),
    );
  }
}

class _FigmaTextField extends StatelessWidget {
  const _FigmaTextField({
    required this.controller,
    required this.label,
    required this.hintText,
    required this.textInputAction,
    this.keyboardType,
    this.validator,
    this.onFieldSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final String hintText;
  final TextInputAction textInputAction;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onFieldSubmitted;

  @override
  Widget build(BuildContext context) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(
        color: Colors.white.withValues(alpha: 0.50),
        width: 1.0,
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label.isNotEmpty) ...[
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.92),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
        ],
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          validator: validator,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14.5,
            height: 1.2,
          ),
          cursorColor: Colors.white,
          onFieldSubmitted: onFieldSubmitted,
          decoration: InputDecoration(
            hintText: hintText,
            hintStyle: TextStyle(
              color: Colors.white.withValues(alpha: 0.55),
              fontSize: 14.5,
            ),
            filled: true,
            fillColor: Colors.white.withValues(alpha: 0.08),
            enabledBorder: border,
            focusedBorder: border.copyWith(
              borderSide: BorderSide(
                color: Colors.white.withValues(alpha: 0.9),
                width: 1.4,
              ),
            ),
            errorBorder: border.copyWith(
              borderSide: BorderSide(
                color: Theme.of(context).colorScheme.error,
                width: 1.4,
              ),
            ),
            focusedErrorBorder: border.copyWith(
              borderSide: BorderSide(
                color: Theme.of(context).colorScheme.error,
                width: 1.4,
              ),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 14,
            ),
          ),
        ),
      ],
    );
  }
}

class _FooterDot extends StatelessWidget {
  const _FooterDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Text('•', style: TextStyle(color: color, fontSize: 12)),
    );
  }
}

class _FooterLink extends StatelessWidget {
  const _FooterLink({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const textStyle = TextStyle(
      fontSize: 11.5,
      height: 0.8,
      color: Colors.white,
      fontWeight: FontWeight.w400,
    );

    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: textStyle.copyWith(
              color: Colors.white.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(height: 3),
          Container(
            height: 1,
            width: _measureTextWidth(context, label, textStyle),
            color: Colors.white,
          ),
        ],
      ),
    );
  }

  double _measureTextWidth(BuildContext context, String text, TextStyle style) {
    final scale = MediaQuery.textScalerOf(context);
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      textScaler: scale,
      maxLines: 1,
    )..layout();
    return painter.width;
  }
}

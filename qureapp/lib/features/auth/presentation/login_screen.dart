import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/branding/qure_brand_mark.dart';
import '../../../core/ui/app_toast.dart';
import '../application/auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isSubmitting = false;
  bool _isPasswordHidden = true;
  bool _keepMeLoggedIn = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    setState(() => _isSubmitting = true);
    final authController = ref.read(authControllerProvider.notifier);
    final error = await authController.login(
      email: _emailController.text.trim(),
      password: _passwordController.text,
    );
    setState(() => _isSubmitting = false);

    if (!mounted) return;
    if (error != null) {
      await AppToast.showError(context, message: error.message);
      return;
    }

    await AppToast.showSuccess(context, message: 'Welcome back.');
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
                              child: _LoginCard(
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
                                      'Login',
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
                                      'please enter your login details to log in',
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
                                      hintText: 'Email or Phone number',
                                      keyboardType: TextInputType.emailAddress,
                                      textInputAction: TextInputAction.next,
                                      validator: (value) {
                                        final input = (value ?? '').trim();
                                        if (input.isEmpty) {
                                          return 'Email or phone is required';
                                        }
                                        return null;
                                      },
                                    ),
                                    const SizedBox(height: 14),
                                    _FigmaTextField(
                                      controller: _passwordController,
                                      label: '',
                                      hintText: 'Password',
                                      obscureText: _isPasswordHidden,
                                      textInputAction: TextInputAction.done,
                                      suffixIcon: IconButton(
                                        onPressed: () => setState(
                                          () => _isPasswordHidden =
                                              !_isPasswordHidden,
                                        ),
                                        icon: Icon(
                                          _isPasswordHidden
                                              ? Icons.visibility_off
                                              : Icons.visibility,
                                          color: Colors.white.withValues(
                                            alpha: 0.85,
                                          ),
                                        ),
                                      ),
                                      validator: (value) {
                                        if ((value ?? '').isEmpty) {
                                          return 'Password is required';
                                        }
                                        return null;
                                      },
                                      onFieldSubmitted: (_) =>
                                          _isSubmitting ? null : _submit(),
                                    ),
                                    const SizedBox(height: 14),
                                    Row(
                                      children: [
                                        SizedBox(
                                          height: 24,
                                          width: 24,
                                          child: Checkbox(
                                            value: _keepMeLoggedIn,
                                            onChanged: _isSubmitting
                                                ? null
                                                : (value) => setState(
                                                    () => _keepMeLoggedIn =
                                                        value ?? false,
                                                  ),
                                            visualDensity:
                                                VisualDensity.compact,
                                            materialTapTargetSize:
                                                MaterialTapTargetSize
                                                    .shrinkWrap,
                                            side: BorderSide(
                                              color: Colors.white.withValues(
                                                alpha: 0.55,
                                              ),
                                              width: 1.1,
                                            ),
                                            checkColor: const Color(0xFF0B3F9A),
                                            activeColor: Colors.white,
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Text(
                                          'Keep me logged in',
                                          style: TextStyle(
                                            fontSize: 13.5,
                                            color: Colors.white.withValues(
                                              alpha: 0.72,
                                            ),
                                          ),
                                        ),
                                        const Spacer(),
                                        InkWell(
                                          onTap: _isSubmitting
                                              ? null
                                              : () => context.push(
                                                  '/forgot-password',
                                                ),
                                          child: Text(
                                            'Forgot password?',
                                            style: TextStyle(
                                              fontSize: 13.5,
                                              color: Colors.white.withValues(
                                                alpha: 0.78,
                                              ),
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                      ],
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
                                            borderRadius: BorderRadius.circular(
                                              14,
                                            ),
                                          ),
                                        ),
                                        onPressed: _isSubmitting
                                            ? null
                                            : _submit,
                                        child: _isSubmitting
                                            ? const SizedBox(
                                                height: 18,
                                                width: 18,
                                                child:
                                                    CircularProgressIndicator(
                                                      strokeWidth: 2,
                                                    ),
                                              )
                                            : const Text(
                                                'Login',
                                                style: TextStyle(
                                                  fontSize: 15,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          'Don’t have an account? ',
                                          style: TextStyle(
                                            fontSize: 13.5,
                                            color: Colors.white.withValues(
                                              alpha: 0.78,
                                            ),
                                          ),
                                        ),
                                        InkWell(
                                          onTap: _isSubmitting
                                              ? null
                                              : () => context.go('/register'),
                                          child: const Text(
                                            'Create an account',
                                            style: TextStyle(
                                              fontSize: 13.5,
                                              color: Colors.white,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const Expanded(child: SizedBox()),
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

class _LoginCard extends StatelessWidget {
  const _LoginCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 620,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.22),
            width: 1,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 18, 22, 18),
          child: child,
        ),
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
    this.obscureText,
    this.suffixIcon,
    this.onFieldSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final String hintText;
  final TextInputAction textInputAction;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;
  final bool? obscureText;
  final Widget? suffixIcon;
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
          obscureText: obscureText ?? false,
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
            suffixIcon: suffixIcon,
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

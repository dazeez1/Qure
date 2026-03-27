import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/branding/qure_brand_mark.dart';
import '../../../core/ui/app_toast.dart';
import '../application/auth_controller.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  String? _genderValue;
  bool _agreedToTerms = false;
  bool _isSubmitting = false;
  bool _isPasswordHidden = true;
  bool _isConfirmPasswordHidden = true;

  static const _genderOptions = ['MALE', 'FEMALE', 'OTHER'];

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    if (!_agreedToTerms) {
      await AppToast.showError(
        context,
        message: 'Please agree to the Terms & Conditions.',
      );
      return;
    }

    final gender = _genderValue;
    if (gender == null || gender.isEmpty) {
      await AppToast.showError(context, message: 'Please select a gender.');
      return;
    }

    setState(() => _isSubmitting = true);
    final authController = ref.read(authControllerProvider.notifier);
    final fullName =
        '${_firstNameController.text.trim()} ${_lastNameController.text.trim()}'.trim();

    final error = await authController.register(
      fullName: fullName,
      email: _emailController.text.trim(),
      password: _passwordController.text,
      phone: _phoneController.text.trim(),
      gender: gender,
    );
    setState(() => _isSubmitting = false);

    if (!mounted) return;
    if (error != null) {
      await AppToast.showError(context, message: error.message);
      return;
    }

    await AppToast.showSuccess(context, message: 'Account created. Please sign in.');
    if (!mounted) return;
    context.go('/login');
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
              colors: [
                Color(0xFF0B3F9A),
                Color(0xFF08307A),
              ],
            ),
          ),
          child: SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(18, topPadding > 0 ? 10 : 22, 18, 16),
              child: Form(
                key: _formKey,
                child: Column(
                  children: [
                    Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 520),
                        child: _AuthCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: const [
                                  QureBrandMarkAuth(),
                                  Spacer(),
                                ],
                              ),
                              const SizedBox(height: 14),
                              Text(
                                'Create Your Account',
                                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                      fontSize: 41,
                                      height: 1.05,
                                      letterSpacing: -0.3,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white,
                                    ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Join to manage visits easily – as a patient',
                                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                      fontSize: 14.5,
                                      color: Colors.white.withValues(alpha: 0.82),
                                    ),
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: _FigmaTextField(
                                      controller: _firstNameController,
                                      label: 'First name',
                                      hintText: 'Enter First name',
                                      textInputAction: TextInputAction.next,
                                      validator: (value) {
                                        if ((value ?? '').trim().isEmpty) {
                                          return 'Required';
                                        }
                                        return null;
                                      },
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _FigmaTextField(
                                      controller: _lastNameController,
                                      label: 'Last name',
                                      hintText: 'Enter Last name',
                                      textInputAction: TextInputAction.next,
                                      validator: (value) {
                                        if ((value ?? '').trim().isEmpty) {
                                          return 'Required';
                                        }
                                        return null;
                                      },
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              _FigmaTextField(
                                controller: _emailController,
                                label: 'E-mail Address',
                                hintText: 'Enter your E-mail',
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.next,
                                validator: (value) {
                                  final email = value?.trim() ?? '';
                                  if (email.isEmpty) return 'Email is required';
                                  if (!email.contains('@')) {
                                    return 'Enter a valid email';
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 12),
                              _FigmaTextField(
                                controller: _phoneController,
                                label: 'Phone Number',
                                hintText: 'Enter your Phone Number',
                                keyboardType: TextInputType.phone,
                                textInputAction: TextInputAction.next,
                                validator: (value) {
                                  final phone = (value ?? '').trim();
                                  if (phone.isEmpty) return 'Phone is required';
                                  if (phone.replaceAll(RegExp(r'\D'), '').length < 10) {
                                    return 'Enter a valid phone number';
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 12),
                              _GenderDropdown(
                                label: 'Gender',
                                value: _genderValue,
                                onChanged: (value) => setState(() => _genderValue = value),
                              ),
                              const SizedBox(height: 12),
                              _FigmaTextField(
                                controller: _passwordController,
                                label: 'Create Password',
                                hintText: 'Enter your Password',
                                obscureText: _isPasswordHidden,
                                textInputAction: TextInputAction.next,
                                suffixIcon: IconButton(
                                  onPressed: () =>
                                      setState(() => _isPasswordHidden = !_isPasswordHidden),
                                  icon: Icon(
                                    _isPasswordHidden ? Icons.visibility_off : Icons.visibility,
                                    color: Colors.white.withValues(alpha: 0.85),
                                  ),
                                ),
                                validator: (value) {
                                  if ((value ?? '').isEmpty) {
                                    return 'Password is required';
                                  }
                                  if ((value ?? '').length < 8) {
                                    return 'Use at least 8 characters';
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 12),
                              _FigmaTextField(
                                controller: _confirmPasswordController,
                                label: 'Confirm Password',
                                hintText: 'Enter your Password',
                                obscureText: _isConfirmPasswordHidden,
                                textInputAction: TextInputAction.done,
                                suffixIcon: IconButton(
                                  onPressed: () => setState(
                                    () => _isConfirmPasswordHidden = !_isConfirmPasswordHidden,
                                  ),
                                  icon: Icon(
                                    _isConfirmPasswordHidden
                                        ? Icons.visibility_off
                                        : Icons.visibility,
                                    color: Colors.white.withValues(alpha: 0.85),
                                  ),
                                ),
                                validator: (value) {
                                  final confirmPassword = value ?? '';
                                  if (confirmPassword.isEmpty) {
                                    return 'Confirm your password';
                                  }
                                  if (confirmPassword != _passwordController.text) {
                                    return 'Passwords do not match';
                                  }
                                  return null;
                                },
                                onFieldSubmitted: (_) => _isSubmitting ? null : _submit(),
                              ),
                              const SizedBox(height: 14),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.center,
                                children: [
                                  SizedBox(
                                    height: 22,
                                    width: 22,
                                    child: Checkbox(
                                      value: _agreedToTerms,
                                      onChanged: _isSubmitting
                                          ? null
                                          : (value) =>
                                              setState(() => _agreedToTerms = value ?? false),
                                      visualDensity: VisualDensity.compact,
                                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                      side: BorderSide(
                                        color: Colors.white.withValues(alpha: 0.55),
                                        width: 1.1,
                                      ),
                                      checkColor: const Color(0xFF0B3F9A),
                                      activeColor: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Wrap(
                                      crossAxisAlignment: WrapCrossAlignment.center,
                                      children: [
                                        Text(
                                          'I agree with the ',
                                          style: TextStyle(
                                            fontSize: 13.5,
                                            color: Colors.white.withValues(alpha: 0.72),
                                          ),
                                        ),
                                        InkWell(
                                          onTap: _isSubmitting ? null : () => context.push('/terms'),
                                          child: Text(
                                            'Terms & Conditions',
                                            // Match login "Forgot password?" styling
                                            style: TextStyle(
                                              fontSize: 13.5,
                                              color: Colors.white.withValues(alpha: 0.78),
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 14),
                              SizedBox(
                                height: 48,
                                child: FilledButton(
                                  style: FilledButton.styleFrom(
                                    backgroundColor: const Color(0xFF0B2E7A),
                                    foregroundColor: Colors.white,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                  ),
                                  onPressed: _isSubmitting ? null : _submit,
                                  child: _isSubmitting
                                      ? const SizedBox(
                                          height: 18,
                                          width: 18,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        )
                                      : const Text(
                                          'Sign up as  Patient',
                                          style: TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                ),
                              ),
                              const SizedBox(height: 14),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    'Already have an account? ',
                                    style: TextStyle(
                                      fontSize: 13.5,
                                      color: Colors.white.withValues(alpha: 0.78),
                                    ),
                                  ),
                                  InkWell(
                                    onTap: _isSubmitting ? null : () => context.go('/login'),
                                    child: const Text(
                                      'Log in here',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Column(
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
                                  message: 'Privacy Policy screen will be added next.',
                                ),
                              ),
                              _FooterDot(color: Colors.white.withValues(alpha: 0.55)),
                              _FooterLink(
                                label: 'Terms of Service',
                                onTap: () => context.push('/terms'),
                              ),
                              _FooterDot(color: Colors.white.withValues(alpha: 0.55)),
                              _FooterLink(
                                label: 'Cookie Settings',
                                onTap: () => AppToast.showInfo(
                                  context,
                                  message: 'Cookie settings are not used in the mobile app.',
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AuthCard extends StatelessWidget {
  const _AuthCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 1),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
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
        Text(
          label,
          style: TextStyle(
            fontSize: 14.5,
            color: Colors.white.withValues(alpha: 0.92),
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          validator: validator,
          obscureText: obscureText ?? false,
          style: const TextStyle(color: Colors.white, fontSize: 14.5, height: 1.2),
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

class _GenderDropdown extends StatelessWidget {
  const _GenderDropdown({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String? value;
  final ValueChanged<String?> onChanged;

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
        Text(
          label,
          style: TextStyle(
            fontSize: 14.5,
            color: Colors.white.withValues(alpha: 0.92),
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: value,
          items: _RegisterScreenState._genderOptions
              .map((g) => DropdownMenuItem(value: g, child: Text(g)))
              .toList(growable: false),
          onChanged: onChanged,
          validator: (value) {
            if (value == null || value.isEmpty) return 'Gender is required';
            return null;
          },
          hint: Text(
            'Select gender',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 14.5,
            ),
          ),
          dropdownColor: const Color(0xFF0B3F9A),
          iconEnabledColor: Colors.white,
          style: const TextStyle(color: Colors.white, fontSize: 14.5),
          decoration: InputDecoration(
            filled: true,
            fillColor: Colors.white.withValues(alpha: 0.08),
            enabledBorder: border,
            focusedBorder: border.copyWith(
              borderSide: BorderSide(
                color: Colors.white.withValues(alpha: 0.9),
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
      height: 1.2,
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
            style: textStyle.copyWith(color: Colors.white.withValues(alpha: 0.75)),
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

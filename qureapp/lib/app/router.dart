import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'dart:async';

import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/auth/presentation/register_screen.dart';
import '../features/legal/presentation/terms_and_conditions_screen.dart';
import '../features/appointments/presentation/book_appointment_screen.dart';
import '../features/shell/presentation/app_shell.dart';
import '../features/splash/presentation/splash_screen.dart';
import '../features/auth/application/auth_controller.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: GoRouterRefreshStream(authState.changes),
    redirect: (context, state) {
      final location = state.matchedLocation;
      final isSplash = location == '/splash';
      final isPublicRoute = location == '/login' ||
          location == '/register' ||
          location == '/terms' ||
          location == '/forgot-password';

      if (authState.isLoading) {
        return isSplash ? null : '/splash';
      }

      if (!authState.isAuthenticated) {
        return isPublicRoute ? null : '/login';
      }

      if (authState.isAuthenticated && (isPublicRoute || isSplash)) {
        return '/';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/terms',
        builder: (context, state) => const TermsAndConditionsScreen(),
      ),
      GoRoute(
        path: '/',
        builder: (context, state) => const AppShell(),
      ),
      GoRoute(
        path: '/book-appointment',
        builder: (context, state) => const BookAppointmentScreen(),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Text(
          state.error?.toString() ?? 'Something went wrong',
          textAlign: TextAlign.center,
        ),
      ),
    ),
  );
});

/// A small adapter so GoRouter can refresh when auth changes.
/// We avoid dependencies on flutter_hooks etc.
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<void> stream) {
    _subscription = stream.listen((_) => notifyListeners());
  }

  late final StreamSubscription<void> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}


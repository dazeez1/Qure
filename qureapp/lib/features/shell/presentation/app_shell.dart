import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../appointments/presentation/appointments_screen.dart';
import '../../dashboard/presentation/dashboard_screen.dart';
import '../../feedback/presentation/feedback_screen.dart';
import '../../queue/presentation/queue_status_screen.dart';
import '../application/shell_tab_index_provider.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedIndex = ref.watch(shellTabIndexProvider);

    final tabs = [
      const DashboardScreen(),
      const AppointmentsScreen(),
      const QueueStatusScreen(),
      const FeedbackScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: selectedIndex, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (index) =>
            ref.read(shellTabIndexProvider.notifier).goTo(index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            label: 'My Bookings',
          ),
          NavigationDestination(
            icon: Icon(Icons.access_time_outlined),
            label: 'Queue Status',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            label: 'Feedback',
          ),
        ],
      ),
    );
  }
}

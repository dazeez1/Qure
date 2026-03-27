import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/application/auth_controller.dart';
import '../../profile/presentation/profile_screen.dart';

const Color kPatientTopBarBlue = Color(0xFF0B3F9A);

/// Shared header: Qure mark on the left, profile avatar on the right.
class PatientTopBar extends ConsumerWidget {
  const PatientTopBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final avatarUrl = ref.watch(authControllerProvider).patient?.avatarUrl;

    return Row(
      children: [
        Row(
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: kPatientTopBarBlue,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Padding(
                padding: EdgeInsets.all(5),
                child: Icon(Icons.add, color: Colors.white, size: 18),
              ),
            ),
            const SizedBox(width: 8),
            const Text(
              'Qure',
              style: TextStyle(
                color: kPatientTopBarBlue,
                fontWeight: FontWeight.w800,
                fontSize: 20,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
        const Spacer(),
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) => const ProfileScreen(),
                ),
              );
            },
            borderRadius: BorderRadius.circular(22),
            child: CircleAvatar(
              radius: 19,
              backgroundColor: const Color(0xFFEEF2F7),
              backgroundImage: avatarUrl != null && avatarUrl.isNotEmpty
                  ? NetworkImage(avatarUrl)
                  : null,
              child: avatarUrl == null || avatarUrl.isEmpty
                  ? const Icon(Icons.person_outline, color: Color(0xFF111827), size: 22)
                  : null,
            ),
          ),
        ),
      ],
    );
  }
}

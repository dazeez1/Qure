import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/branding/qure_brand_mark.dart';
import '../../auth/application/auth_controller.dart';
import '../../profile/presentation/profile_screen.dart';

/// Shared header: Qure logo on the left, profile avatar on the right.
class PatientTopBar extends ConsumerWidget {
  const PatientTopBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final avatarUrl = ref.watch(authControllerProvider).patient?.avatarUrl;

    return Row(
      children: [
        const QureBrandMarkPatientAppBar(),
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

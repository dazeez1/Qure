import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_toast.dart';

/// Compact legal row: copyright left, links right (matches web / booking footers).
class PatientLegalFooter extends StatelessWidget {
  const PatientLegalFooter({super.key});

  @override
  Widget build(BuildContext context) {
    final muted = Colors.grey.shade500;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '© 2025 Qure Nigeria. All rights reserved.',
            style: TextStyle(fontSize: 11.5, color: muted),
          ),
          const SizedBox(height: 8),
          Wrap(
            alignment: WrapAlignment.end,
            spacing: 4,
            runSpacing: 4,
            children: [
              _Link(
                label: 'Privacy Policy',
                onTap: () => AppToast.showInfo(
                  context,
                  message: 'Privacy Policy screen will be added next.',
                ),
              ),
              Text('·', style: TextStyle(color: muted, fontSize: 11.5)),
              _Link(
                label: 'Terms of Service',
                onTap: () => context.push('/terms'),
              ),
              Text('·', style: TextStyle(color: muted, fontSize: 11.5)),
              _Link(
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
    );
  }
}

class _Link extends StatelessWidget {
  const _Link({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11.5,
          color: Colors.grey.shade600,
          decoration: TextDecoration.underline,
          decorationColor: Colors.grey.shade600,
        ),
      ),
    );
  }
}

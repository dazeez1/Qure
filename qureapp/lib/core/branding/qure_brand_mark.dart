import 'package:flutter/material.dart';

/// Brand logo asset. Replace [assets/images/qure_logo.png] with your official Qure artwork.
const String kQureLogoAssetPath = 'assets/images/qure_logo.png';

/// Qure logo + wordmark for patient shell (light background).
class QureBrandMarkPatientAppBar extends StatelessWidget {
  const QureBrandMarkPatientAppBar({super.key, this.showLabel = true});

  final bool showLabel;

  static const Color _blue = Color(0xFF0B3F9A);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          kQureLogoAssetPath,
          height: 30,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
          errorBuilder: (context, error, stackTrace) {
            return Container(
              height: 30,
              width: 30,
              decoration: BoxDecoration(
                color: _blue,
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.add, color: Colors.white, size: 18),
            );
          },
        ),
        if (showLabel) ...[
          const SizedBox(width: 8),
          const Text(
            'Qure',
            style: TextStyle(
              color: _blue,
              fontWeight: FontWeight.w800,
              fontSize: 20,
              letterSpacing: -0.2,
            ),
          ),
        ],
      ],
    );
  }
}

/// Logo + label on auth screens (gradient background, logo on white pill).
class QureBrandMarkAuth extends StatelessWidget {
  const QureBrandMarkAuth({super.key, this.label = 'Qure'});

  final String label;

  static const Color _blue = Color(0xFF0B3F9A);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.95),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Image.asset(
              kQureLogoAssetPath,
              height: 20,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
              errorBuilder: (context, error, stackTrace) {
                return const Icon(
                  Icons.add_box_outlined,
                  size: 20,
                  color: _blue,
                );
              },
            ),
          ),
        ),
        const SizedBox(width: 10),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 20,
          ),
        ),
      ],
    );
  }
}

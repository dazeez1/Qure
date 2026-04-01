import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/patient_legal_footer.dart';
import '../../auth/application/auth_controller.dart';
import '../../shell/presentation/patient_top_bar.dart';
import '../data/patient_profile_api.dart';
import '../domain/patient_profile_models.dart';

final patientProfileProvider =
    FutureProvider.autoDispose<PatientProfileDetails>((ref) async {
      return ref.watch(patientProfileApiProvider).getMe();
    });

const Color _kPageBg = Color(0xFFF3F4F6);
const Color _kTitle = Color(0xFF111827);
const Color _kBorder = Color(0xFFE6E8EC);
const Color _kAvatarBlue = Color(0xFF0B3F9A);
const Color _kSaveGreen = Color(0xFF16A34A);
const Color _kLogoutBrown = Color(0xFF7C2D12);

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _isUploadingAvatar = false;
  bool _saving = false;

  Future<void> _pickAndUploadAvatar() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (image == null) {
      return;
    }

    setState(() => _isUploadingAvatar = true);
    try {
      await ref.read(patientProfileApiProvider).uploadAvatar(File(image.path));
      if (!mounted) {
        return;
      }
      await AppToast.showSuccess(context, message: 'Avatar updated.');
      ref.invalidate(patientProfileProvider);
    } catch (e) {
      if (!mounted) {
        return;
      }
      await AppToast.showError(
        context,
        message: userFacingErrorMessage(e),
      );
    } finally {
      if (mounted) {
        setState(() => _isUploadingAvatar = false);
      }
    }
  }

  Future<void> _logout() async {
    await ref.read(authControllerProvider.notifier).logout();
    if (!mounted) {
      return;
    }
    await AppToast.showInfo(context, message: 'Signed out.');
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(patientProfileProvider);

    return Scaffold(
      backgroundColor: _kPageBg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            const PatientTopBar(),
            const SizedBox(height: 16),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Profile',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: _kTitle,
                      height: 1.1,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => ref.invalidate(patientProfileProvider),
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh',
                ),
              ],
            ),
            const SizedBox(height: 16),
            profile.when(
              data: (data) => _ProfileMainCard(
                key: ValueKey(data.id),
                profile: data,
                saving: _saving,
                isUploadingAvatar: _isUploadingAvatar,
                onUploadAvatar: _isUploadingAvatar
                    ? null
                    : _pickAndUploadAvatar,
                onSave: (phone, gender) => _saveProfile(phone, gender),
                onLogout: _logout,
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  userFacingErrorMessage(e),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
              loading: () => const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
            ),
            const PatientLegalFooter(),
          ],
        ),
      ),
    );
  }

  Future<void> _saveProfile(String phone, String gender) async {
    setState(() => _saving = true);
    try {
      await ref
          .read(patientProfileApiProvider)
          .updateProfile(
            phone: phone.trim().isEmpty ? null : phone.trim(),
            gender: gender.trim().isEmpty ? null : gender.trim(),
          );
      if (!mounted) {
        return;
      }
      await AppToast.showSuccess(context, message: 'Profile updated.');
      ref.invalidate(patientProfileProvider);
    } catch (e) {
      if (!mounted) {
        return;
      }
      await AppToast.showError(
        context,
        message: userFacingErrorMessage(e),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }
}

class _ProfileMainCard extends StatefulWidget {
  const _ProfileMainCard({
    super.key,
    required this.profile,
    required this.saving,
    required this.isUploadingAvatar,
    required this.onUploadAvatar,
    required this.onSave,
    required this.onLogout,
  });

  final PatientProfileDetails profile;
  final bool saving;
  final bool isUploadingAvatar;
  final VoidCallback? onUploadAvatar;
  final Future<void> Function(String phone, String gender) onSave;
  final Future<void> Function() onLogout;

  @override
  State<_ProfileMainCard> createState() => _ProfileMainCardState();
}

class _ProfileMainCardState extends State<_ProfileMainCard> {
  late final TextEditingController _phoneController;
  String? _gender;

  @override
  void initState() {
    super.initState();
    _phoneController = TextEditingController(text: widget.profile.phone ?? '');
    _gender = widget.profile.gender;
  }

  @override
  void didUpdateWidget(covariant _ProfileMainCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.profile.id != widget.profile.id) {
      _phoneController.text = widget.profile.phone ?? '';
      _gender = widget.profile.gender;
    } else {
      if (oldWidget.profile.phone != widget.profile.phone) {
        _phoneController.text = widget.profile.phone ?? '';
      }
      if (oldWidget.profile.gender != widget.profile.gender) {
        _gender = widget.profile.gender;
      }
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  static const _genders = ['MALE', 'FEMALE', 'OTHER'];

  String _genderLabel(String code) {
    switch (code) {
      case 'MALE':
        return 'Male';
      case 'FEMALE':
        return 'Female';
      case 'OTHER':
        return 'Other';
      default:
        return code;
    }
  }

  InputDecoration _fieldDecoration({String? hint}) {
    return InputDecoration(
      hintText: hint,
      isDense: true,
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _kBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _kBorder),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.profile;

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 22, 18, 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: CircleAvatar(
              radius: 44,
              backgroundColor: _kAvatarBlue,
              backgroundImage: p.avatarUrl != null && p.avatarUrl!.isNotEmpty
                  ? NetworkImage(p.avatarUrl!)
                  : null,
              child: p.avatarUrl == null || p.avatarUrl!.isEmpty
                  ? const Icon(Icons.person, size: 44, color: Colors.white)
                  : null,
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: OutlinedButton(
              onPressed: widget.onUploadAvatar,
              style: OutlinedButton.styleFrom(
                foregroundColor: _kTitle,
                side: const BorderSide(color: _kTitle),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 10,
                ),
              ),
              child: widget.isUploadingAvatar
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text(
                      'Upload/Change',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 22),
          _LabeledReadOnlyField(label: 'Full Name', value: p.fullName),
          const SizedBox(height: 14),
          _LabeledReadOnlyField(label: 'Email Address', value: p.email),
          const SizedBox(height: 14),
          Text(
            'Phone Number',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: Colors.grey.shade900,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            enabled: !widget.saving,
            decoration: _fieldDecoration(hint: 'Phone'),
          ),
          const SizedBox(height: 14),
          Text(
            'Gender',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: Colors.grey.shade900,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _kBorder),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                isExpanded: true,
                hint: const Text('Select gender'),
                value: _genders.contains(_gender) ? _gender : null,
                items: _genders
                    .map(
                      (g) => DropdownMenuItem(
                        value: g,
                        child: Text(_genderLabel(g)),
                      ),
                    )
                    .toList(),
                onChanged: widget.saving
                    ? null
                    : (v) => setState(() => _gender = v),
              ),
            ),
          ),
          const SizedBox(height: 22),
          SizedBox(
            height: 48,
            width: double.infinity,
            child: FilledButton(
              onPressed: widget.saving
                  ? null
                  : () => widget.onSave(_phoneController.text, _gender ?? ''),
              style: FilledButton.styleFrom(
                backgroundColor: _kSaveGreen,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: widget.saving
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Save Changes',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 48,
            width: double.infinity,
            child: FilledButton(
              onPressed: () => widget.onLogout(),
              style: FilledButton.styleFrom(
                backgroundColor: _kLogoutBrown,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                'Logout',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LabeledReadOnlyField extends StatelessWidget {
  const _LabeledReadOnlyField({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: Colors.grey.shade900,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _kBorder),
          ),
          child: Text(
            value,
            style: const TextStyle(fontSize: 15, color: _kTitle),
          ),
        ),
      ],
    );
  }
}

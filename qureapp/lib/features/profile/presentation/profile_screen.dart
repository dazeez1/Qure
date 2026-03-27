import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/ui/app_toast.dart';
import '../../auth/application/auth_controller.dart';
import '../data/patient_profile_api.dart';
import '../domain/patient_profile_models.dart';

final patientProfileProvider =
    FutureProvider.autoDispose<PatientProfileDetails>((ref) async {
  final profileApi = ref.watch(patientProfileApiProvider);
  final profile = await profileApi.getMe();
  final prefs = await profileApi.getNotificationPreferences();
  return PatientProfileDetails(
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    gender: profile.gender,
    dateOfBirth: profile.dateOfBirth,
    avatarUrl: profile.avatarUrl,
    emailNotificationsEnabled: prefs.emailEnabled,
    pushNotificationsEnabled: prefs.pushEnabled,
  );
});

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _isUploadingAvatar = false;

  Future<void> _pickAndUploadAvatar() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (image == null) return;

    setState(() => _isUploadingAvatar = true);
    try {
      await ref.read(patientProfileApiProvider).uploadAvatar(File(image.path));
      if (!mounted) return;
      await AppToast.showSuccess(context, message: 'Avatar updated.');
      ref.invalidate(patientProfileProvider);
    } catch (e) {
      if (!mounted) return;
      await AppToast.showError(context, message: e.toString());
    } finally {
      if (mounted) setState(() => _isUploadingAvatar = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final profile = ref.watch(patientProfileProvider);

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Profile',
                    style: Theme.of(context).textTheme.headlineMedium,
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
              data: (data) => _ProfileDetailsCard(
                profile: data,
                isUploadingAvatar: _isUploadingAvatar,
                onUploadAvatar: _isUploadingAvatar ? null : _pickAndUploadAvatar,
                onToggleEmailNotifications: (enabled) async {
                  try {
                    await ref
                        .read(patientProfileApiProvider)
                        .setNotificationPreferences(emailEnabled: enabled);
                    ref.invalidate(patientProfileProvider);
                  } catch (e) {
                    if (context.mounted) {
                      await AppToast.showError(context, message: e.toString());
                    }
                  }
                },
                onTogglePushNotifications: (enabled) async {
                  try {
                    await ref
                        .read(patientProfileApiProvider)
                        .setNotificationPreferences(pushEnabled: enabled);
                    ref.invalidate(patientProfileProvider);
                  } catch (e) {
                    if (context.mounted) {
                      await AppToast.showError(context, message: e.toString());
                    }
                  }
                },
                onEditContact: () => _editContact(data),
              ),
              error: (e, _) => Text(e.toString()),
              loading: () => const Center(child: CircularProgressIndicator()),
            ),
            const SizedBox(height: 20),
            if (authState.patient != null) ...[
              Text('Signed in as ${authState.patient!.email}'),
            ],
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () async {
                await ref.read(authControllerProvider.notifier).logout();
                if (context.mounted) {
                  await AppToast.showInfo(context, message: 'Signed out.');
                }
              },
              child: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _editContact(PatientProfileDetails profile) async {
    final phoneController = TextEditingController(text: profile.phone ?? '');
    final genderController = TextEditingController(text: profile.gender ?? '');

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Update profile'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: genderController,
              decoration: const InputDecoration(labelText: 'Gender (MALE/FEMALE/OTHER)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );

    if (saved != true) return;
    try {
      await ref.read(patientProfileApiProvider).updateProfile(
            phone: phoneController.text.trim().isEmpty ? null : phoneController.text.trim(),
            gender: genderController.text.trim().isEmpty ? null : genderController.text.trim(),
          );
      if (!mounted) return;
      await AppToast.showSuccess(context, message: 'Profile updated.');
      ref.invalidate(patientProfileProvider);
    } catch (e) {
      if (!mounted) return;
      await AppToast.showError(context, message: e.toString());
    }
  }
}

class _ProfileDetailsCard extends StatelessWidget {
  const _ProfileDetailsCard({
    required this.profile,
    required this.isUploadingAvatar,
    required this.onUploadAvatar,
    required this.onToggleEmailNotifications,
    required this.onTogglePushNotifications,
    required this.onEditContact,
  });

  final PatientProfileDetails profile;
  final bool isUploadingAvatar;
  final VoidCallback? onUploadAvatar;
  final ValueChanged<bool> onToggleEmailNotifications;
  final ValueChanged<bool> onTogglePushNotifications;
  final VoidCallback onEditContact;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6E8EC)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundImage: profile.avatarUrl == null ? null : NetworkImage(profile.avatarUrl!),
                  child: profile.avatarUrl == null ? const Icon(Icons.person) : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(profile.fullName, style: Theme.of(context).textTheme.titleMedium),
                      Text(profile.email, style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: onUploadAvatar,
                  icon: isUploadingAvatar
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.photo_camera_outlined),
                  tooltip: 'Update avatar',
                ),
              ],
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Phone'),
              subtitle: Text(profile.phone ?? 'Not set'),
              trailing: TextButton(onPressed: onEditContact, child: const Text('Edit')),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: profile.emailNotificationsEnabled,
              onChanged: onToggleEmailNotifications,
              title: const Text('Email notifications'),
              subtitle: const Text('Receive appointment reminders via email'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: profile.pushNotificationsEnabled,
              onChanged: onTogglePushNotifications,
              title: const Text('Push notifications'),
              subtitle: const Text('Receive queue and appointment updates on your phone'),
            ),
          ],
        ),
      ),
    );
  }
}


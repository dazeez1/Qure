import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/patient_push_token_api.dart';

final pushTokenRegistrarProvider = Provider<PushTokenRegistrar>((ref) {
  final api = ref.watch(patientPushTokenApiProvider);
  return PushTokenRegistrar(pushTokenApi: api);
});

class PushTokenRegistrar {
  PushTokenRegistrar({
    required PatientPushTokenApi pushTokenApi,
  })  : _pushTokenApi = pushTokenApi,
        _messaging = FirebaseMessaging.instance;

  final PatientPushTokenApi _pushTokenApi;
  final FirebaseMessaging _messaging;

  Future<void> registerIfPossible() async {
    await _messaging.requestPermission();

    final token = await _messaging.getToken();
    if (token == null || token.isEmpty) return;

    final platform = Platform.isIOS
        ? 'ios'
        : Platform.isAndroid
            ? 'android'
            : 'web';

    await _pushTokenApi.registerToken(token: token, platform: platform);
  }
}


import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Bottom navigation index for [AppShell]. Other features can switch tabs via
/// `ref.read(shellTabIndexProvider.notifier).goTo(n)`.
final shellTabIndexProvider =
    NotifierProvider<ShellTabIndexNotifier, int>(ShellTabIndexNotifier.new);

class ShellTabIndexNotifier extends Notifier<int> {
  @override
  int build() => 0;

  void goTo(int index) {
    state = index;
  }
}

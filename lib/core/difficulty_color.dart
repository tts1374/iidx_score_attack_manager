import 'package:flutter/material.dart';

Color difficultyColor(String? difficulty) {
  switch (difficulty?.toUpperCase()) {
    case 'BEGINNER':
      return const Color(0xFF79D100);
    case 'NORMAL':
      return const Color(0xFF20A8FF);
    case 'HYPER':
      return const Color(0xFFFF7800);
    case 'ANOTHER':
      return const Color(0xFFFF0000);
    case 'LEGGENDARIA':
      return const Color(0xFFCE00D6);
    default:
      return Colors.grey;
  }
}

import type { LucideIcon } from 'lucide-react-native';
import {
  CalendarDays,
  Package,
  Shield,
  User,
  Users,
  Wallet,
} from 'lucide-react-native';
import { colors } from '../../constants/colors';

export type OnboardingSlideType = 'welcome' | 'roles' | 'feature' | 'start';

export interface OnboardingRoleItem {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

export interface OnboardingStartStep {
  titleKey: string;
  descriptionKey: string;
}

export interface OnboardingSlide {
  id: string;
  type: OnboardingSlideType;
  titleKey: string;
  subtitleKey?: string;
  bulletKeys?: string[];
  accent?: string;
  icon?: LucideIcon;
  roles?: OnboardingRoleItem[];
  steps?: OnboardingStartStep[];
}

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 'welcome',
    type: 'welcome',
    titleKey: 'onboarding.appName',
    subtitleKey: 'onboarding.appTagline',
    icon: Package,
  },
  {
    id: 'roles',
    type: 'roles',
    titleKey: 'onboarding.slide1.title',
    subtitleKey: 'onboarding.slide1.subtitle',
    roles: [
      {
        id: 'owner',
        titleKey: 'onboarding.slide1.owner.title',
        descriptionKey: 'onboarding.slide1.owner.description',
        icon: Shield,
      },
      {
        id: 'admin',
        titleKey: 'onboarding.slide1.admin.title',
        descriptionKey: 'onboarding.slide1.admin.description',
        icon: Users,
      },
      {
        id: 'employee',
        titleKey: 'onboarding.slide1.employee.title',
        descriptionKey: 'onboarding.slide1.employee.description',
        icon: User,
      },
    ],
  },
  {
    id: 'schedule',
    type: 'feature',
    titleKey: 'onboarding.slide2.title',
    subtitleKey: 'onboarding.slide2.subtitle',
    icon: CalendarDays,
    accent: '#4CAF50',
    bulletKeys: [
      'onboarding.slide2.bullet1',
      'onboarding.slide2.bullet2',
      'onboarding.slide2.bullet3',
    ],
  },
  {
    id: 'finance',
    type: 'feature',
    titleKey: 'onboarding.slide3.title',
    subtitleKey: 'onboarding.slide3.subtitle',
    icon: Wallet,
    accent: '#26A69A',
    bulletKeys: [
      'onboarding.slide3.bullet1',
      'onboarding.slide3.bullet2',
      'onboarding.slide3.bullet3',
    ],
  },
  {
    id: 'start',
    type: 'start',
    titleKey: 'onboarding.slide4.title',
    subtitleKey: 'onboarding.slide4.subtitle',
    steps: [
      {
        titleKey: 'onboarding.slide4.step1.title',
        descriptionKey: 'onboarding.slide4.step1.description',
      },
      {
        titleKey: 'onboarding.slide4.step2.title',
        descriptionKey: 'onboarding.slide4.step2.description',
      },
      {
        titleKey: 'onboarding.slide4.step3.title',
        descriptionKey: 'onboarding.slide4.step3.description',
      },
    ],
  },
];

export const ONBOARDING_ACCENT = colors.primary;

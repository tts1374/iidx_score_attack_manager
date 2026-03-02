import { createTheme } from '@mui/material/styles';
import type {} from '@mui/x-date-pickers/themeAugmentation';

const SURFACE_2 = 'var(--surface-2)';
const SURFACE_3 = 'var(--surface-3)';
const SURFACE_MUTED = 'var(--surface-muted)';
const SURFACE = 'var(--surface)';
const BACKDROP = 'var(--backdrop)';
const SHADOW = 'var(--shadow)';
const SHADOW_HOVER = 'var(--shadow-hover)';
const BORDER_STRONG = 'var(--border-strong)';

type ThemeWithVars = {
  vars?: { palette?: Record<string, any> };
  palette: Record<string, any>;
};

function paletteVars(theme: ThemeWithVars): Record<string, any> {
  return theme.vars?.palette ?? theme.palette;
}

export const muiTheme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'media',
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    button: {
      fontWeight: 700,
      textTransform: 'none',
    },
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#1d4ed8',
          dark: '#1e40af',
          light: '#2563eb',
          contrastText: '#ffffff',
        },
        error: {
          main: '#b91c1c',
          dark: '#991b1b',
          light: '#dc2626',
          contrastText: '#ffffff',
        },
        warning: {
          main: '#92400e',
          dark: '#78350f',
          light: '#b45309',
          contrastText: '#ffffff',
        },
        success: {
          main: '#166534',
          dark: '#14532d',
          light: '#15803d',
          contrastText: '#ffffff',
        },
        background: {
          default: '#f7f8fa',
          paper: '#ffffff',
        },
        text: {
          primary: '#111827',
          secondary: '#475569',
        },
        divider: '#d0d8e8',
        action: {
          hover: 'rgba(15, 23, 42, 0.06)',
          selected: '#e9edf3',
          disabled: '#94a3b8',
          disabledBackground: '#f1f5f9',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#7caeff',
          dark: '#6ea8ff',
          light: '#8bc3ff',
          contrastText: '#101826',
        },
        error: {
          main: '#ff9a9a',
          dark: '#ff7f7f',
          light: '#ffb3b3',
          contrastText: '#101826',
        },
        warning: {
          main: '#ffbd7a',
          dark: '#ffb070',
          light: '#ffd4a4',
          contrastText: '#101826',
        },
        success: {
          main: '#a4ddb4',
          dark: '#7fcf97',
          light: '#bfe8cb',
          contrastText: '#101826',
        },
        background: {
          default: '#1f242d',
          paper: '#2a313c',
        },
        text: {
          primary: '#e5ebf3',
          secondary: '#c2ccda',
        },
        divider: '#9fb0c7',
        action: {
          hover: 'rgba(255, 255, 255, 0.08)',
          selected: '#334155',
          disabled: '#94a3b8',
          disabledBackground: '#364052',
        },
      },
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        colorInherit: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
          };
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: BACKDROP,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            '&.MuiCard-outlined': {
              borderColor: palette.divider,
              backgroundColor: palette.background.paper,
              color: palette.text.primary,
              boxShadow: SHADOW,
            },
            '& .MuiTypography-root.MuiTypography-colorTextSecondary': {
              color: palette.text.secondary,
            },
            '& .MuiDivider-root': {
              borderColor: palette.divider,
            },
            '& .MuiInputBase-root': {
              color: palette.text.primary,
              backgroundColor: SURFACE_2,
            },
            '& .MuiInputLabel-root': {
              color: palette.text.secondary,
            },
            '& .MuiSelect-icon': {
              color: palette.text.secondary,
            },
            '& .MuiFormHelperText-root': {
              color: palette.text.secondary,
            },
            '& .MuiChip-root.MuiChip-colorDefault': {
              backgroundColor: SURFACE_3,
              color: palette.text.secondary,
              border: `1px solid ${palette.divider}`,
            },
            '& .MuiChip-root.MuiChip-colorDefault .MuiChip-icon, & .MuiChip-root.MuiChip-colorDefault .MuiChip-deleteIcon': {
              color: palette.text.secondary,
            },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.divider,
            },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.text.secondary,
            },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.primary.main,
            },
            '& .MuiFormControlLabel-label': {
              color: palette.text.primary,
            },
            '& .MuiInputLabel-root.Mui-disabled': {
              color: palette.action.disabled,
            },
            '& .MuiInputBase-input.Mui-disabled': {
              color: palette.text.secondary,
              WebkitTextFillColor: palette.text.secondary,
            },
            '& .MuiInputBase-root.Mui-disabled': {
              backgroundColor: SURFACE_3,
            },
            '& .MuiSwitch-track': {
              backgroundColor: SURFACE_MUTED,
              opacity: 1,
            },
            '& .MuiSwitch-thumb': {
              backgroundColor: palette.background.paper,
            },
            '& .MuiSwitch-switchBase.Mui-checked': {
              color: palette.background.paper,
            },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
              backgroundColor: palette.primary.light,
              opacity: 1,
            },
            '& .MuiAccordionSummary-expandIconWrapper': {
              color: palette.text.secondary,
            },
          };
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
            border: `1px solid ${palette.divider}`,
            boxShadow: SHADOW,
            '& .MuiDialogTitle-root, & .MuiDialogContent-root, & .MuiDialogActions-root': {
              color: palette.text.primary,
            },
            '& .MuiDialogContentText-root, & .MuiTypography-root.MuiTypography-colorTextSecondary': {
              color: palette.text.secondary,
            },
            '& .MuiDivider-root': {
              borderColor: palette.divider,
            },
            '& .MuiInputBase-root': {
              color: palette.text.primary,
              backgroundColor: SURFACE_2,
            },
            '& .MuiInputLabel-root': {
              color: palette.text.secondary,
            },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.divider,
            },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.text.secondary,
            },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.primary.main,
            },
            '& .hintText': {
              color: palette.text.secondary,
            },
          };
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            '&.MuiDialogContent-dividers': {
              borderTopColor: palette.divider,
              borderBottomColor: palette.divider,
            },
          };
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderTop: `1px solid ${paletteVars(theme).divider}`,
        }),
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
            border: `1px solid ${palette.divider}`,
            boxShadow: SHADOW,
          };
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            '&:hover': {
              backgroundColor: palette.action.hover,
            },
            '&.Mui-selected, &.Mui-selected:hover': {
              backgroundColor: palette.action.selected,
            },
            '&.Mui-disabled': {
              color: palette.action.disabled,
              opacity: 1,
            },
          };
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            borderRadius: 10,
            '&.Mui-disabled': {
              borderColor: palette.divider,
              color: palette.action.disabled,
              backgroundColor: palette.action.disabledBackground,
            },
          };
        },
        contained: {
          boxShadow: SHADOW,
          '&:hover': {
            boxShadow: SHADOW_HOVER,
          },
        },
        containedPrimary: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            backgroundColor: palette.primary.main,
            color: palette.primary.contrastText,
            '&:hover': {
              backgroundColor: palette.primary.dark,
            },
          };
        },
        containedError: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            backgroundColor: palette.error.main,
            color: palette.error.contrastText,
            '&:hover': {
              backgroundColor: palette.error.dark,
            },
          };
        },
        containedWarning: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            backgroundColor: palette.warning.main,
            color: palette.warning.contrastText,
            '&:hover': {
              backgroundColor: palette.warning.dark,
            },
          };
        },
        containedSuccess: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            backgroundColor: palette.success.main,
            color: palette.success.contrastText,
            '&:hover': {
              backgroundColor: palette.success.dark,
            },
          };
        },
        outlined: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            borderColor: palette.divider,
            '&:hover': {
              borderColor: palette.text.secondary,
              backgroundColor: palette.action.hover,
            },
          };
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: SHADOW,
          '&:hover': {
            boxShadow: SHADOW_HOVER,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.divider,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.text.secondary,
            },
          };
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            color: palette.text.secondary,
            borderColor: BORDER_STRONG,
            '&.Mui-selected, &.Mui-selected:hover': {
              backgroundColor: palette.action.selected,
              color: palette.text.primary,
            },
          };
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        root: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            '& .MuiInputBase-root': {
              minHeight: 44,
            },
            '& .MuiOutlinedInput-root': {
              backgroundColor: SURFACE,
              color: palette.text.primary,
            },
            '& .MuiInputBase-input::placeholder': {
              color: 'var(--text-faint)',
              opacity: 1,
            },
            '& .MuiAutocomplete-popupIndicator': {
              color: 'var(--create-song-popup-icon)',
            },
            '& .MuiAutocomplete-clearIndicator': {
              color: 'var(--text-subtle)',
            },
          };
        },
        popper: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            '& .MuiPaper-root': {
              background: 'var(--create-song-dropdown-bg)',
              color: palette.text.primary,
              border: `1px solid var(--create-song-dropdown-border)`,
              boxShadow: SHADOW,
            },
            '& .MuiAutocomplete-listbox': {
              background: 'var(--create-song-dropdown-bg)',
              color: palette.text.primary,
            },
            '& .MuiAutocomplete-option': {
              color: palette.text.primary,
              '&:hover, &.Mui-focused': {
                background: 'var(--create-song-dropdown-hover)',
              },
              "&[aria-selected='true'], &[aria-selected='true'].Mui-focused": {
                background: 'var(--create-song-dropdown-selected)',
              },
            },
          };
        },
      },
    },
    MuiPickersTextField: {
      styleOverrides: {
        root: ({ theme }) => {
          const palette = paletteVars(theme);
          return {
            '&.createPeriodDatePickerTextField .MuiOutlinedInput-root, &.createPeriodDatePickerTextField .MuiInputBase-root, &.createPeriodDatePickerTextField .MuiPickersInputBase-root, &.createPeriodDatePickerTextField .MuiPickersOutlinedInput-root':
              {
                backgroundColor: SURFACE,
                color: palette.text.primary,
                minHeight: 44,
              },
            '&.createPeriodDatePickerTextField .MuiInputBase-input, &.createPeriodDatePickerTextField .MuiPickersInputBase-input, &.createPeriodDatePickerTextField .MuiPickersSectionList-root, &.createPeriodDatePickerTextField .MuiPickersSectionList-section':
              {
                color: `${palette.text.primary} !important`,
                WebkitTextFillColor: palette.text.primary,
              },
            '&.createPeriodDatePickerTextField .MuiInputBase-input::placeholder': {
              color: 'var(--text-faint)',
              opacity: 1,
            },
            '&.createPeriodDatePickerTextField .MuiIconButton-root, &.createPeriodDatePickerTextField .MuiSvgIcon-root': {
              color: 'var(--text-subtle)',
            },
          };
        },
      },
    },
  },
});

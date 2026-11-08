import React from 'react';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton } from '@mui/material';
import { useTranslation } from 'react-i18next';

export function ContextHelp({ title, children, disabled = false }: {
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <IconButton
        aria-label={title}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        disabled={disabled}
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{title}</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 1.5 }}>{children}</DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

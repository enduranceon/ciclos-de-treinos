import { createContext, useContext, useState } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  // dialog: { title, message, confirmText, variant, onConfirm }

  function confirm({ title, message, confirmText = 'Confirmar', variant = 'danger', onConfirm }) {
    setDialog({ title, message, confirmText, variant, onConfirm });
  }

  function handleConfirm() {
    dialog?.onConfirm?.();
    setDialog(null);
  }

  function handleCancel() {
    setDialog(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {dialog && (
        <div
          className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
          onClick={handleCancel}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Accent bar */}
            <div className={`h-1 w-full ${dialog.variant === 'danger' ? 'bg-red-500' : 'bg-[#001F3F]'}`} />

            <div className="p-6 space-y-4">
              {/* Icon + title */}
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  dialog.variant === 'danger' ? 'bg-red-50' : 'bg-slate-100'
                }`}>
                  <span className="text-base">
                    {dialog.variant === 'danger' ? '🗑️' : '⚠️'}
                  </span>
                </div>
                <div className="pt-0.5 space-y-1">
                  <h3 className="text-sm font-black text-[#001F3F] leading-snug">{dialog.title}</h3>
                  {dialog.message && (
                    <p className="text-xs text-slate-500 leading-relaxed">{dialog.message}</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors ${
                    dialog.variant === 'danger'
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-[#001F3F] hover:bg-[#002a55]'
                  }`}
                >
                  {dialog.confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}


interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
}

/**
 * Toast 提示组件
 */
export default function Toast({ message, type }: ToastProps) {
  return (
    <div className={`toast toast-${type}`}>
      {type === 'success' && '✓ '}
      {type === 'error' && '✗ '}
      {message}
    </div>
  );
}

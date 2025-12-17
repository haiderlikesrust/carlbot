// Custom dialog utilities - replaces browser alert/prompt/confirm
import { showAlert } from '../components/CustomAlert'
import { showConfirm } from '../components/CustomConfirm'
import { showPrompt } from '../components/CustomPrompt'

// Make available globally
if (typeof window !== 'undefined') {
  window.customAlert = showAlert
  window.customConfirm = showConfirm
  window.customPrompt = showPrompt
}

export { showAlert, showConfirm, showPrompt }

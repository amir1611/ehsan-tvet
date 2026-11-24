const messages = {
  "Anda tidak boleh memadam akaun sendiri.": "You cannot delete your own account.",
  "Anda tidak boleh mengubah akses akaun sendiri.": "You cannot change your own access.",
  "Anda tidak boleh menukar peranan sendiri.": "You cannot change your own role.",
  "Anda tidak boleh menyahaktifkan akaun sendiri.": "You cannot deactivate your own account.",
  "Anda tidak mempunyai kebenaran untuk tindakan ini.": "You do not have permission to perform this action.",
  "Dilarang": "Access denied.",
  "Format imej tidak sah. Gunakan JPG, PNG atau WebP.": "Choose a JPG, PNG or WebP image.",
  "Format permintaan tidak disokong.": "Unsupported request format.",
  "Halaman tidak ditemui": "Page not found.",
  "Imej terlalu besar (maksimum 5MB).": "The image must be 5 MB or smaller.",
  "Kaedah tidak dibenarkan": "This request method is not allowed.",
  "Kandungan laman tidak sah.": "Check the website content and try again.",
  "Kandungan tidak sah.": "Check the content and try again.",
  "Kata laluan baharu mesti sekurang-kurangnya 8 aksara.": "Use at least 8 characters for the new password.",
  "Kata laluan mesti sekurang-kurangnya 8 aksara.": "Use at least 8 characters for the password.",
  "Kata laluan semasa tidak betul.": "The current password is incorrect.",
  "Lengkapkan maklumat dan persetujuan anda.": "Complete the required fields and confirm your consent.",
  "Lengkapkan nama, peranan dan kata laluan (sekurang-kurangnya 8 aksara).": "Enter a name, select a role and use a password with at least 8 characters.",
  "Maklumat tidak sah.": "Invalid sign-in details.",
  "Mesti ada sekurang-kurangnya satu pentadbir aktif.": "At least one administrator must remain active.",
  "Nama pengguna 3–60 aksara (huruf kecil, nombor, . _ @ -).": "Use 3–60 lowercase letters, numbers, periods, underscores, @ or hyphens for the username.",
  "Nama pengguna atau kata laluan tidak sah.": "Incorrect username or password.",
  "Nama pengguna sudah digunakan.": "This username is already in use.",
  "Nama tidak sah.": "Enter a valid name.",
  "Origin tidak dibenarkan": "Requests from this origin are not allowed.",
  "Pengguna tidak ditemui.": "User not found.",
  "Peranan tidak sah.": "Choose a valid role.",
  "Sila cuba lagi kemudian.": "Please try again later.",
  "Sila log masuk.": "Please sign in.",
  "Status tidak sah": "Choose a valid status.",
  "Status tidak sah.": "Choose a valid status.",
  "Terlalu banyak muat naik. Cuba lagi kemudian.": "Too many uploads. Please try again later.",
  "Terlalu banyak percubaan. Cuba lagi dalam 15 minit.": "Too many attempts. Try again in 15 minutes.",
  "Terlalu banyak percubaan.": "Too many attempts. Please try again later.",
  "Tidak ditemui": "Record not found.",
  "Permintaan terlalu besar.": "The request is too large.",
  "Permintaan tidak dapat diproses.": "The request could not be processed."
};

export async function readAdminResponse(response) {
  const data = await response.json().catch(() => null);
  if (!data) throw Error('The admin service is unavailable. Please try again later.');
  if (!response.ok) throw Error(messages[data.error] || 'The request could not be completed.');
  return data;
}

// Audit details are stored in their original language. Translate system-generated
// details for display without modifying names, course titles or saved records.
export function auditDetail(event) {
  const detail = event.detail || '';
  switch (event.action) {
    case 'login_failed':
      return detail === 'Nama pengguna atau kata laluan salah' ? 'Incorrect username or password' : detail;
    case 'upload':
      return detail.replace(/^Imej dimuat naik /, 'Image uploaded ');
    case 'user_create':
      return detail.replace(/^Peranan: /, 'Role: ');
    case 'user_update':
      return detail.split(', ').map(part => ({
        nama:'name', diaktifkan:'activated', dinyahaktifkan:'deactivated'
      }[part] || part.replace(/^peranan /, 'role '))).join(', ');
    case 'course_create':
    case 'course_delete':
      return detail.replace(/^Kod /, 'Code ');
    case 'course_update':
    case 'content_update':
      return detail.replace(/^Diubah: /, 'Changed: ').replaceAll('seksyen ', 'section ');
    case 'enquiry_status':
      return detail.split(' → ').map(status => enquiryStatus[status] || status).join(' → ');
    default:
      return detail;
  }
}

export const enquiryStatus = {Baharu:'New', Dihubungi:'Contacted', Selesai:'Completed'};

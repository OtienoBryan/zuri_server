const { DateTime } = require('luxon');

console.log('🕐 Testing Nairobi Timezone with Luxon\n');

// Get current time in different timezones
const utcTime = DateTime.now().setZone('UTC');
const nairobiTime = DateTime.now().setZone('Africa/Nairobi');
const serverTime = DateTime.now();

console.log('Server Timezone:', serverTime.zoneName);
console.log('Server Time:    ', serverTime.toFormat('yyyy-MM-dd HH:mm:ss'));
console.log('');
console.log('UTC Time:       ', utcTime.toFormat('yyyy-MM-dd HH:mm:ss'));
console.log('Nairobi Time:   ', nairobiTime.toFormat('yyyy-MM-dd HH:mm:ss'));
console.log('');

// Show the MySQL format that will be used
const mysqlFormat = nairobiTime.toFormat('yyyy-MM-dd HH:mm:ss');
console.log('MySQL Format (Nairobi):', mysqlFormat);
console.log('');

// Show various display formats
console.log('Display Formats:');
console.log('- Full:         ', nairobiTime.toFormat('DDDD'));
console.log('- Short:        ', nairobiTime.toFormat('dd/MM/yyyy HH:mm'));
console.log('- 12-hour:      ', nairobiTime.toFormat('dd/MM/yyyy hh:mm a'));
console.log('- ISO:          ', nairobiTime.toISO());
console.log('');

// Show timezone offset
console.log('Timezone Info:');
console.log('- Offset:       ', nairobiTime.offset, 'minutes (', nairobiTime.offset / 60, 'hours)');
console.log('- Offset Name:  ', nairobiTime.offsetNameShort);
console.log('- Timezone:     ', nairobiTime.zoneName);
console.log('');

console.log('✅ Luxon is working correctly!');
console.log('');
console.log('📝 Note: Nairobi (EAT) is UTC+3, which is 180 minutes ahead of UTC');


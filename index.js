const { 
    Client, GatewayIntentBits, ActivityType, REST, Routes, 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, PermissionsBitField, MessageFlags 
} = require('discord.js');
const http = require('http');

// 1. RENDER İÇİN ZORUNLU WEB SUNUCUSU (Application exited early hatasını engeller)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('BOT VE WEB SUNUCUSU 7/24 AKTIF!\n');
});

// Render'ın dinamik portunu ve 0.0.0.0 IP'sini dinle
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [WEB SUNUCU]: Sunucu ${PORT} portunda aktif dinlemede.`);
});

// Botun beklenmeyen hatalarda çökmesini önleyen güvenlik katmanı
process.on('unhandledRejection', error => {
    console.error('⚠️ [HATA ENGELLENDİ]:', error);
});

process.on('uncaughtException', error => {
    console.error('⚠️ [YAKALANMAYAN HATA]:', error);
});

// Discord Bot İstemcisi
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Geçici Depolama Alanları
const otoRolAyarlari = new Map();
const cekilisler = new Map();
const oylamalar = new Map();

// SLASH KOMUTLARI TANIMI
const commands = [
    new SlashCommandBuilder()
        .setName('yaz')
        .setDescription('🤖 Belirttiğiniz mesajı bot adıyla kanala gönderir.')
        .addStringOption(opt => opt.setName('mesaj').setDescription('Gönderilecek mesaj metni').setRequired(true))
        .addChannelOption(opt => opt.setName('kanal').setDescription('Mesajın atılacağı kanal (Opsiyonel)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('duyuru-dm')
        .setDescription('📢 Sunucudaki TÜM ÜYELERE özel mesaj (DM) olarak duyuru gönderir.')
        .addStringOption(opt => opt.setName('mesaj').setDescription('DM ile gönderilecek duyuru metni').setRequired(true)),

    new SlashCommandBuilder()
        .setName('dogrulama-kur')
        .setDescription('✅ Butonlu kullanıcı doğrulama panelini kurar.')
        .addRoleOption(opt => opt.setName('rol').setDescription('Doğrulanan üyelere verilecek rol').setRequired(true)),

    new SlashCommandBuilder()
        .setName('oto-rol')
        .setDescription('🤖 Sunucuya yeni katılan üyelere otomatik verilecek rolü ayarlar.')
        .addRoleOption(opt => opt.setName('rol').setDescription('Otomatik verilecek rol').setRequired(true)),

    new SlashCommandBuilder()
        .setName('sunucubilgi')
        .setDescription('🏰 Sunucu hakkındaki detaylı bilgileri gösterir.'),

    new SlashCommandBuilder()
        .setName('cekilis')
        .setDescription('🎁 Zamanlayıcılı canlı çekiliş başlatır.')
        .addStringOption(opt => opt.setName('odul').setDescription('Çekiliş ödülü').setRequired(true))
        .addIntegerOption(opt => opt.setName('sure').setDescription('Çekiliş süresi (Dakika)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('oylama')
        .setDescription('📊 Butonlu canlı oylama başlatır.')
        .addStringOption(opt => opt.setName('soru').setDescription('Oylama sorusu/konusu').setRequired(true))
        .addIntegerOption(opt => opt.setName('sure').setDescription('Oylama süresi (Dakika)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('sil')
        .setDescription('🧹 Kanaldan belirtilen sayıda mesaj siler.')
        .addIntegerOption(opt => opt.setName('sayi').setDescription('Silinecek mesaj sayısı (1-100)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('🦶 Bir üyeyi sunucudan atar.')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Atılacak kullanıcı').setRequired(true))
        .addStringOption(opt => opt.setName('sebep').setDescription('Atılma sebebi').setRequired(false)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('🔨 Bir üyeyi sunucudan yasaklar.')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Yasaklanacak kullanıcı').setRequired(true))
        .addStringOption(opt => opt.setName('sebep').setDescription('Yasaklanma sebebi').setRequired(false)),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('🔓 Bir kullanıcının yasaklamasını kaldırır.')
        .addStringOption(opt => opt.setName('id').setDescription('Yasaklaması kaldırılacak kullanıcının ID adresi').setRequired(true))
].map(command => command.toJSON());

// BOT HAZIR OLDUĞUNDA
client.once('ready', async () => {
    console.log(`🛡️ [SİSTEM AKTİF]: ${client.user.tag} başarıyla oturum açtı!`);
    client.user.setActivity('🏰 Sunucu Yönetimi', { type: ActivityType.Watching });
    
    if (!process.env.DISCORD_TOKEN) {
        console.error('❌ [KRİTİK HATA]: DISCORD_TOKEN ortam değişkeni bulunamadı!');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { 
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); 
        console.log('✅ [KOMUTLAR]: Tüm slash komutları Discord API\'ye yüklendi.'); 
    } catch (error) { 
        console.error('❌ [KOMUT YÜKLEME HATASI]:', error); 
    }
});

// OTO ROL SİSTEMİ
client.on('guildMemberAdd', async member => {
    const otoRolId = otoRolAyarlari.get(member.guild.id);
    if (otoRolId) {
        const rol = member.guild.roles.cache.get(otoRolId);
        if (rol) {
            await member.roles.add(rol).catch(err => console.error('Oto rol verme hatası:', err));
        }
    }
});

// OTOMATİK SELAMLAMA (SA-AS)
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const icerik = message.content.toLowerCase().trim();
    if (['sa', 's.a', 's.a.', 'selamun aleykum', 'selamün aleyküm'].includes(icerik)) {
        await message.reply('Aleykum Selam, Hoş Geldin! 👋');
    }
});

// INTERACTION (KOMUT VE BUTON) DİNLEYİCİSİ
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // Yetki Kontrolü (sunucubilgi hariç yönetici yetkisi ister)
        if (commandName !== 'sunucubilgi' && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Bu komutu kullanmak için `Yönetici` yetkisine sahip olmalısınız.', flags: MessageFlags.Ephemeral });
        }

        if (commandName === 'yaz') {
            const mesaj = interaction.options.getString('mesaj');
            const hedefKanal = interaction.options.getChannel('kanal') || interaction.channel;
            try {
                await hedefKanal.send({ content: mesaj });
                await interaction.reply({ content: `✅ Mesaj ${hedefKanal} kanalına gönderildi.`, flags: MessageFlags.Ephemeral });
            } catch {
                await interaction.reply({ content: '❌ Mesaj gönderilemedi. Kanal izinlerini kontrol edin.', flags: MessageFlags.Ephemeral });
            }
        }
        else if (commandName === 'duyuru-dm') {
            const duyuruMetni = interaction.options.getString('mesaj');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setAuthor({ name: `${interaction.guild.name} • DUYURU`, iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
                .setDescription(duyuruMetni)
                .setFooter({ text: `Gönderen: ${interaction.guild.name}`, iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            const members = await interaction.guild.members.fetch();
            let basarili = 0, basarisiz = 0;

            for (const [id, member] of members) {
                if (member.user.bot) continue;
                try {
                    await member.send({ embeds: [embed] });
                    basarili++;
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit engeli
                } catch { basarisiz++; }
            }
            await interaction.editReply({ content: `✅ **DM Duyurusu Gönderildi!**\n🟢 Başarılı: \`${basarili}\` | 🔴 Kapalı DM: \`${basarisiz}\`` });
        }
        else if (commandName === 'dogrulama-kur') {
            const verilecekRol = interaction.options.getRole('rol');
            const embed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🛡️ **KULLANICI DOĞRULAMA**')
                .setDescription('Sunucuya tam erişim sağlamak için aşağıdaki **"✅ Doğrula"** butonuna tıklayınız.')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`verify_button_${verilecekRol.id}`).setLabel('Doğrula').setStyle(ButtonStyle.Success).setEmoji('✅')
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: `✅ Doğrulama paneli oluşturuldu. Verilecek Rol: <@&${verilecekRol.id}>`, flags: MessageFlags.Ephemeral });
        }
        else if (commandName === 'oto-rol') {
            const rol = interaction.options.getRole('rol');
            otoRolAyarlari.set(interaction.guild.id, rol.id);
            await interaction.reply({ content: `✅ Otomatik verilecek rol ayarlandı: <@&${rol.id}>`, flags: MessageFlags.Ephemeral });
        }
        else if (commandName === 'sunucubilgi') {
            const guild = interaction.guild;
            const embed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle(`🏰 ${guild.name}`)
                .addFields(
                    { name: '🆔 Sunucu ID', value: `\`${guild.id}\``, inline: true },
                    { name: '👑 Sunucu Sahibi', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '👥 Üye Sayısı', value: `\`${guild.memberCount}\``, inline: true }
                ).setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
        else if (commandName === 'sil') {
            const sayi = interaction.options.getInteger('sayi');
            if (sayi < 1 || sayi > 100) return interaction.reply({ content: '❌ Lütfen 1-100 arasında bir sayı girin.', flags: MessageFlags.Ephemeral });

            const deleted = await interaction.channel.bulkDelete(sayi, true).catch(() => null);
            if (!deleted) return interaction.reply({ content: '❌ 14 günden eski mesajlar toplu silinemez.', flags: MessageFlags.Ephemeral });

            await interaction.reply({ content: `🧹 **${deleted.size}** adet mesaj temizlendi.`, flags: MessageFlags.Ephemeral });
        }
        else if (commandName === 'kick') {
            const user = interaction.options.getUser('kullanici');
            const sebep = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (!member) return interaction.reply({ content: '❌ Kullanıcı sunucuda bulunamadı.', flags: MessageFlags.Ephemeral });
            if (!member.kickable) return interaction.reply({ content: '❌ Bu kullanıcıyı atmak için yetkim yetersiz.', flags: MessageFlags.Ephemeral });

            await member.kick(sebep);
            await interaction.reply({ content: `🦶 **${user.tag}** sunucudan atıldı. Sebep: \`${sebep}\`` });
        }
        else if (commandName === 'ban') {
            const user = interaction.options.getUser('kullanici');
            const sebep = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (member && !member.bannable) return interaction.reply({ content: '❌ Bu kullanıcıyı yasaklamak için yetkim yetersiz.', flags: MessageFlags.Ephemeral });

            await interaction.guild.members.ban(user.id, { reason: sebep });
            await interaction.reply({ content: `🔨 **${user.tag}** sunucudan yasaklandı. Sebep: \`${sebep}\`` });
        }
        else if (commandName === 'unban') {
            const userId = interaction.options.getString('id');
            try {
                await interaction.guild.members.unban(userId);
                await interaction.reply({ content: `🔓 \`${userId}\` ID'li kullanıcının yasağı kaldırıldı.` });
            } catch {
                await interaction.reply({ content: '❌ Belirtilen ID\'ye sahip yasaklı kullanıcı bulunamadı.', flags: MessageFlags.Ephemeral });
            }
        }
        else if (commandName === 'cekilis') {
            const odul = interaction.options.getString('odul');
            const sureDakika = interaction.options.getInteger('sure');
            const bitisZamani = Math.floor((Date.now() + sureDakika * 60 * 1000) / 1000);

            const embed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('🎉 **ÇEKİLİŞ BAŞLADI**')
                .setDescription(`🏆 **Ödül:** \`${odul}\`\n⏰ **Bitiş:** <t:${bitisZamani}:R>`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('cekilis_katil').setLabel('Çekilişe Katıl (0)').setStyle(ButtonStyle.Primary).setEmoji('🎁')
            );

            await interaction.reply({ content: '✅ Çekiliş oluşturuldu!', flags: MessageFlags.Ephemeral });
            const mesaj = await interaction.channel.send({ embeds: [embed], components: [row] });
            cekilisler.set(mesaj.id, { katilanlar: new Set(), odul });

            setTimeout(async () => {
                const veriler = cekilisler.get(mesaj.id);
                if (!veriler) return;
                const katilanlar = Array.from(veriler.katilanlar);
                let kazanan = katilanlar.length > 0 ? `<@${katilanlar[Math.floor(Math.random() * katilanlar.length)]}>` : 'Kimse katılmadı';

                const bitisEmbed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle('🎉 **ÇEKİLİŞ SONUÇLANDI**')
                    .setDescription(`🏆 **Ödül:** \`${veriler.odul}\`\n👑 **Kazanan:** ${kazanan}`);

                await mesaj.edit({ embeds: [bitisEmbed], components: [] }).catch(() => {});
                cekilisler.delete(mesaj.id);
            }, sureDakika * 60 * 1000);
        }
        else if (commandName === 'oylama') {
            const soru = interaction.options.getString('soru');
            const sureDakika = interaction.options.getInteger('sure');
            const bitisZamani = Math.floor((Date.now() + sureDakika * 60 * 1000) / 1000);

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('📊 **OYLAMA**')
                .setDescription(`📌 **Soru:** ${soru}\n⏰ **Bitiş:** <t:${bitisZamani}:R>\n\n✅ **Evet:** \`0\` | ❌ **Hayır:** \`0\``);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('oy_evet').setLabel('Evet (0)').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('oy_hayir').setLabel('Hayır (0)').setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({ content: '✅ Oylama başlatıldı!', flags: MessageFlags.Ephemeral });
            const mesaj = await interaction.channel.send({ embeds: [embed], components: [row] });
            oylamalar.set(mesaj.id, { soru, evet: new Set(), hayir: new Set() });

            setTimeout(async () => {
                const veri = oylamalar.get(mesaj.id);
                if (!veri) return;
                const bitisEmbed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('📊 **OYLAMA TAMAMLANDI**')
                    .setDescription(`📌 **Soru:** ${veri.soru}\n\n✅ **Evet:** \`${veri.evet.size}\` | ❌ **Hayır:** \`${veri.hayir.size}\``);
                await mesaj.edit({ embeds: [bitisEmbed], components: [] }).catch(() => {});
                oylamalar.delete(mesaj.id);
            }, sureDakika * 60 * 1000);
        }
    }
    else if (interaction.isButton()) {
        const { customId, guild, member, user, message } = interaction;

        if (customId.startsWith('verify_button_')) {
            const rolId = customId.split('verify_button_')[1];
            const rol = guild.roles.cache.get(rolId);
            if (!rol) return interaction.reply({ content: '❌ Rol sistemde bulunamadı.', flags: MessageFlags.Ephemeral });
            if (member.roles.cache.has(rol.id)) return interaction.reply({ content: 'ℹ️ Zaten doğrulanmış durumdasınız.', flags: MessageFlags.Ephemeral });

            await member.roles.add(rol);
            await interaction.reply({ content: `🎉 Doğrulama başarılı! <@&${rol.id}> rolü hesabınıza tanımlandı.`, flags: MessageFlags.Ephemeral });
        }
        else if (customId === 'cekilis_katil') {
            const veri = cekilisler.get(message.id);
            if (!veri) return interaction.reply({ content: '❌ Bu çekiliş sona ermiş.', flags: MessageFlags.Ephemeral });

            if (veri.katilanlar.has(user.id)) {
                veri.katilanlar.delete(user.id);
                await interaction.reply({ content: '❌ Çekiliş katılımınız iptal edildi.', flags: MessageFlags.Ephemeral });
            } else {
                veri.katilanlar.add(user.id);
                await interaction.reply({ content: '🎉 Çekilişe başarıyla katıldınız!', flags: MessageFlags.Ephemeral });
            }
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('cekilis_katil').setLabel(`Çekilişe Katıl (${veri.katilanlar.size})`).setStyle(ButtonStyle.Primary).setEmoji('🎁')
            );
            await message.edit({ components: [row] }).catch(() => {});
        }
        else if (customId === 'oy_evet' || customId === 'oy_hayir') {
            const veri = oylamalar.get(message.id);
            if (!veri) return interaction.reply({ content: '❌ Bu oylama sona ermiş.', flags: MessageFlags.Ephemeral });

            if (customId === 'oy_evet') { veri.hayir.delete(user.id); veri.evet.add(user.id); }
            else { veri.evet.delete(user.id); veri.hayir.add(user.id); }

            await interaction.reply({ content: '✅ Oyunuz başarıyla kaydedildi!', flags: MessageFlags.Ephemeral });

            const embed = EmbedBuilder.from(message.embeds[0])
                .setDescription(`📌 **Soru:** ${veri.soru}\n\n✅ **Evet:** \`${veri.evet.size}\` | ❌ **Hayır:** \`${veri.hayir.size}\``);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('oy_evet').setLabel(`Evet (${veri.evet.size})`).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('oy_hayir').setLabel(`Hayır (${veri.hayir.size})`).setStyle(ButtonStyle.Danger)
            );
            await message.edit({ embeds: [embed], components: [row] }).catch(() => {});
        }
    }
});

// Bot Girişi
client.login(process.env.DISCORD_TOKEN);

const { 
    Client, GatewayIntentBits, ActivityType, REST, Routes, 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, PermissionsBitField, MessageFlags 
} = require('discord.js');
const http = require('http');

// Botun çökmesini önleyen güvenlik katmanı
process.on('unhandledRejection', error => {
    console.error('⚠️ [HATA ENGELLENDİ]:', error);
});

// Render 7/24 Aktiflik İçin Web Sunucu
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('BOT VE WEB SUNUCUSU AKTIF!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 [WEB SUNUCU]: Sunucu ${PORT} portunda aktif.`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Depolama Alanları
const otoRolAyarlari = new Map();
const cekilisler = new Map();
const oylamalar = new Map();

// SLASH KOMUTLARI
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

// BOT HAZIR
client.once('clientReady', async () => {
    console.log(`🛡️ [SİSTEM AKTİF]: ${client.user.tag} göreve başladı!`);
    client.user.setActivity('🏰 Sunucu Yönetimi', { type: ActivityType.Watching });
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { 
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); 
        console.log('✅ [KOMUTLAR]: Tüm slash komutları kaydedildi.'); 
    } catch (error) { 
        console.error('❌ [KOMUT HATASI]:', error); 
    }
});

// OTO ROL
client.on('guildMemberAdd', async member => {
    const otoRolId = otoRolAyarlari.get(member.guild.id);
    if (otoRolId) {
        const rol = member.guild.roles.cache.get(otoRolId);
        if (rol) {
            await member.roles.add(rol).catch(err => console.error('Oto rol hatası:', err));
        }
    }
});

// SA-AS
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const icerik = message.content.toLowerCase().trim();
    if (['sa', 's.a', 's.a.', 'selamun aleykum', 'selamün aleyküm'].includes(icerik)) {
        await message.reply('Aleykum Selam, Hoş Geldin! 👋');
    }
});

// INTERACTION HANDLER
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName !== 'sunucubilgi' && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Bu komut için `Yönetici` yetkisi gereklidir.', flags: MessageFlags.Ephemeral });
        }

        if (commandName === 'yaz') {
            const mesaj = interaction.options.getString('mesaj');
            const hedefKanal = interaction.options.getChannel('kanal') || interaction.channel;
            try {
                await hedefKanal.send({ content: mesaj });
                await interaction.reply({ content: `✅ Mesaj ${hedefKanal} kanalına gönderildi.`, flags: MessageFlags.Ephemeral });
            } catch {
                await interaction.reply({ content: '❌ Mesaj gönderilemedi.', flags: MessageFlags.Ephemeral });
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
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch { basarisiz++; }
            }
            await interaction.editReply({ content: `✅ **DM Duyuru Tamamlandı!**\n🟢 Başarılı: \`${basarili}\` | 🔴 Başarısız: \`${basarisiz}\`` });
        }
        else if (commandName === 'dogrulama-kur') {
            const verilecekRol = interaction.options.getRole('rol');
            const embed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🛡️ **KULLANICI DOĞRULAMA**')
                .setDescription('Sunucuya erişmek için aşağıdaki **"✅ Doğrula"** butonuna tıklayınız.')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`verify_button_${verilecekRol.id}`).setLabel('Doğrula').setStyle(ButtonStyle.Success).setEmoji('✅')
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: `✅ Panel kuruldu. Rol: <@&${verilecekRol.id}>`, flags: MessageFlags.Ephemeral });
        }
        else if (commandName === 'oto-rol') {
            const rol = interaction.options.getRole('rol');
            otoRolAyarlari.set(interaction.guild.id, rol.id);
            await interaction.reply({ content: `✅ Oto rol ayarlandı: <@&${rol.id}>`, flags: MessageFlags.Ephemeral });
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
            if (!deleted) return interaction.reply({ content: '❌ Mesajlar silinemedi.', flags: MessageFlags.Ephemeral });

            await interaction.reply({ content: `🧹 **${deleted.size}** mesaj silindi.`, flags: MessageFlags.Ephemeral });
        }
        else if (commandName === 'kick') {
            const user = interaction.options.getUser('kullanici');
            const sebep = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (!member) return interaction.reply({ content: '❌ Kullanıcı bulunamadı.', flags: MessageFlags.Ephemeral });
            if (!member.kickable) return interaction.reply({ content: '❌ Yetkim yetersiz.', flags: MessageFlags.Ephemeral });

            await member.kick(sebep);
            await interaction.reply({ content: `🦶 **${user.tag}** atıldı. Sebep: \`${sebep}\`` });
        }
        else if (commandName === 'ban') {
            const user = interaction.options.getUser('kullanici');
            const sebep = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (member && !member.bannable) return interaction.reply({ content: '❌ Yetkim yetersiz.', flags: MessageFlags.Ephemeral });

            await interaction.guild.members.ban(user.id, { reason: sebep });
            await interaction.reply({ content: `🔨 **${user.tag}** yasaklandı. Sebep: \`${sebep}\`` });
        }
        else if (commandName === 'unban') {
            const userId = interaction.options.getString('id');
            try {
                await interaction.guild.members.unban(userId);
                await interaction.reply({ content: `🔓 \`${userId}\` ID'li kullanıcının yasağı kaldırıldı.` });
            } catch {
                await interaction.reply({ content: '❌ Yasaklama kaldırılamadı.', flags: MessageFlags.Ephemeral });
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

            await interaction.reply({ content: '✅ Çekiliş başlatıldı!', flags: MessageFlags.Ephemeral });
            const mesaj = await interaction.channel.send({ embeds: [embed], components: [row] });
            cekilisler.set(mesaj.id, { katilanlar: new Set(), odul });

            setTimeout(async () => {
                const veriler = cekilisler.get(mesaj.id);
                if (!veriler) return;
                const katilanlar = Array.from(veriler.katilanlar);
                let kazanan = katilanlar.length > 0 ? `<@${katilanlar[Math.floor(Math.random() * katilanlar.length)]}>` : 'Yok';

                const bitisEmbed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle('🎉 **ÇEKİLİŞ BİTTİ**')
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
                    .setTitle('📊 **OYLAMA BİTTİ**')
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
            if (!rol) return interaction.reply({ content: '❌ Rol bulunamadı.', flags: MessageFlags.Ephemeral });
            if (member.roles.cache.has(rol.id)) return interaction.reply({ content: 'ℹ️ Zaten bu role sahipsiniz.', flags: MessageFlags.Ephemeral });

            await member.roles.add(rol);
            await interaction.reply({ content: `🎉 <@&${rol.id}> rolü verildi!`, flags: MessageFlags.Ephemeral });
        }
        else if (customId === 'cekilis_katil') {
            const veri = cekilisler.get(message.id);
            if (!veri) return interaction.reply({ content: '❌ Çekiliş bitti.', flags: MessageFlags.Ephemeral });

            if (veri.katilanlar.has(user.id)) {
                veri.katilanlar.delete(user.id);
                await interaction.reply({ content: '❌ Çekilişten ayrıldınız.', flags: MessageFlags.Ephemeral });
            } else {
                veri.katilanlar.add(user.id);
                await interaction.reply({ content: '🎉 Çekilişe katıldınız!', flags: MessageFlags.Ephemeral });
            }
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('cekilis_katil').setLabel(`Çekilişe Katıl (${veri.katilanlar.size})`).setStyle(ButtonStyle.Primary).setEmoji('🎁')
            );
            await message.edit({ components: [row] }).catch(() => {});
        }
        else if (customId === 'oy_evet' || customId === 'oy_hayir') {
            const veri = oylamalar.get(message.id);
            if (!veri) return interaction.reply({ content: '❌ Oylama bitti.', flags: MessageFlags.Ephemeral });

            if (customId === 'oy_evet') { veri.hayir.delete(user.id); veri.evet.add(user.id); }
            else { veri.evet.delete(user.id); veri.hayir.add(user.id); }

            await interaction.reply({ content: '✅ Oyunuz kaydedildi!', flags: MessageFlags.Ephemeral });

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

client.login(process.env.DISCORD_TOKEN);

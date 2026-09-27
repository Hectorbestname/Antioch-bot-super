const { Client, GatewayIntentBits, ActivityType, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, MessageFlags } = require('discord.js');
const http = require('http');

// Botun çökmesini önleyen güvenlik katmanı
process.on('unhandledRejection', error => {
    console.error('⚠️ [HATA ENGELLENDİ]:', error);
});

// Render / Replit vb. platformlarda botun 7/24 açık kalması için web sunucu
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('MESAJ, DUYURU, VERIFY, OTOROL, SUNUCUBILGI, CEKILIS VE OYLAMA BOTU AKTIF!\n');
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

// Sistem verilerini hafızada tutan Haritalar
const otoRolAyarlari = new Map();
const cekilisler = new Map();
const oylamalar = new Map();

// SADECE İSTENEN 7 ADET SLASH KOMUTU
const commands = [
    // 1. Botun Mesaj Göndermesi Komutu
    new SlashCommandBuilder()
        .setName('yaz')
        .setDescription('🤖 Belirttiğiniz mesajı bot adıyla kanala gönderir.')
        .addStringOption(opt => opt.setName('mesaj').setDescription('Gönderilecek mesaj metni').setRequired(true))
        .addChannelOption(opt => opt.setName('kanal').setDescription('Mesajın atılacağı kanal (Opsiyonel)').setRequired(false)),

    // 2. DM Duyuru Komutu
    new SlashCommandBuilder()
        .setName('duyuru-dm')
        .setDescription('📢 Sunucudaki TÜM ÜYELERE özel mesaj (DM) olarak duyuru gönderir.')
        .addStringOption(opt => opt.setName('mesaj').setDescription('DM ile gönderilecek duyuru metni').setRequired(true)),

    // 3. Doğrulama (Verify) Paneli Kurma Komutu
    new SlashCommandBuilder()
        .setName('verify-kur')
        .setDescription('✅ Butonlu kullanıcı doğrulama panelini kurar.')
        .addRoleOption(opt => opt.setName('rol').setDescription('Doğrulanan üyelere verilecek rol').setRequired(true)),

    // 4. Oto Rol Ayarlama Komutu
    new SlashCommandBuilder()
        .setName('otorol-ayarla')
        .setDescription('🤖 Sunucuya yeni katılan üyelere otomatik verilecek rolü ayarlar.')
        .addRoleOption(opt => opt.setName('rol').setDescription('Otomatik verilecek rol').setRequired(true)),

    // 5. Sunucu Bilgi Komutu
    new SlashCommandBuilder()
        .setName('sunucubilgi')
        .setDescription('🏰 Sunucu hakkındaki istatistikleri ve detaylı bilgileri gösterir.'),

    // 6. Çekiliş Komutu
    new SlashCommandBuilder()
        .setName('cekilis')
        .setDescription('🎁 Zamanlayıcılı canlı çekiliş başlatır.')
        .addStringOption(opt => opt.setName('odul').setDescription('Çekiliş ödülü').setRequired(true))
        .addIntegerOption(opt => opt.setName('sure').setDescription('Çekiliş süresi (Dakika)').setRequired(true)),

    // 7. Oylama Komutu
    new SlashCommandBuilder()
        .setName('oylama')
        .setDescription('📊 Butonlu canlı oylama başlatır.')
        .addStringOption(opt => opt.setName('soru').setDescription('Oylama sorusu/konusu').setRequired(true))
        .addIntegerOption(opt => opt.setName('sure').setDescription('Oylama süresi (Dakika)').setRequired(true))
].map(command => command.toJSON());

client.once('clientReady', async () => {
    console.log(`🛡️ [SİSTEM AKTİF]: ${client.user.tag} göreve başladı!`);
    client.user.setActivity('🏰 Sunucu Yönetimi & Duyuru', { type: ActivityType.Watching });
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { 
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); 
        console.log('✅ [KOMUTLAR]: Slash komutları kaydedildi.'); 
    } catch (error) { 
        console.error('❌ [KOMUT HATASI]:', error); 
    }
});

// SUNUCUYA YENİ BİRİ KATILDIĞINDA OTO ROL VERME
client.on('guildMemberAdd', async member => {
    const otoRolId = otoRolAyarlari.get(member.guild.id);
    if (otoRolId) {
        const rol = member.guild.roles.cache.get(otoRolId);
        if (rol) {
            await member.roles.add(rol).catch(err => console.error('Oto rol verme hatası:', err));
        }
    }
});

// OTOMATİK SA-AS SİSTEMİ
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const icerik = message.content.toLowerCase().trim();

    if (icerik === 'sa' || icerik === 's.a' || icerik === 's.a.' || icerik === 'selamun aleykum' || icerik === 'selamün aleyküm') {
        await message.reply('Aleykum Selam, Hoş Geldin! 👋');
    }
});

// INTERACTION HANDLER
client.on('interactionCreate', async interaction => {

    // --- SLASH KOMUTLARI YÖNETİMİ ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName !== 'sunucubilgi' && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ **HATA:** Bu komutu kullanmak için `Yönetici` yetkisine sahip olmalısın.', flags: MessageFlags.Ephemeral });
        }

        // 💬 1. BOTUN MESAJ GÖNDERMESİ (/yaz)
        if (commandName === 'yaz') {
            const mesaj = interaction.options.getString('mesaj');
            const hedefKanal = interaction.options.getChannel('kanal') || interaction.channel;

            try {
                await hedefKanal.send({ content: mesaj });
                await interaction.reply({ content: `✅ Mesajınız ${hedefKanal} kanalına gönderildi.`, flags: MessageFlags.Ephemeral });
            } catch (err) {
                await interaction.reply({ content: '❌ **HATA:** Mesaj gönderilemedi. Botun yazma yetkisini kontrol edin.', flags: MessageFlags.Ephemeral });
            }
        }

        // 📩 2. HERKESE ÖZEL MESAJ (DM) ATMA (/duyuru-dm)
        else if (commandName === 'duyuru-dm') {
            const duyuruMetni = interaction.options.getString('mesaj');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setAuthor({ 
                    name: `${interaction.guild.name} • RESMİ SUNUCU DUYURUSU`, 
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() 
                })
                .setDescription(duyuruMetni)
                .setFooter({ 
                    text: `Bu mesaj ${interaction.guild.name} yönetimi tarafından gönderilmiştir.`, 
                    iconURL: client.user.displayAvatarURL() 
                })
                .setTimestamp();

            const members = await interaction.guild.members.fetch();
            let basarili = 0;
            let basarisiz = 0;

            await interaction.editReply({ content: `⌛ **DM Duyurusu Gönderiliyor...** (${members.size} Üye)` });

            for (const [id, member] of members) {
                if (member.user.bot) continue;
                try {
                    await member.send({ embeds: [embed] });
                    basarili++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (err) {
                    basarisiz++;
                }
            }

            await interaction.editReply({ 
                content: `✅ **DM Duyuru İşlemi Tamamlandı!**\n\n🟢 **Başarılı:** \`${basarili}\` Üye\n🔴 **Başarısız (DM Kapalı):** \`${basarisiz}\` Üye` 
            });
        }

        // ✅ 3. DOĞRULAMA (VERIFY) PANELİ KURMA (/verify-kur)
        else if (commandName === 'verify-kur') {
            const verilecekRol = interaction.options.getRole('rol');

            const embed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🛡️ **KULLANICI DOĞRULAMA SİSTEMİ**')
                .setDescription('Sunucudaki kanallara erişim sağlamak ve doğrulanmış üye olmak için aşağıdaki **"✅ Doğrula"** butonuna basınız.')
                .setFooter({ text: `${interaction.guild.name} Güvenlik Sistemi`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`verify_button_${verilecekRol.id}`)
                    .setLabel('Doğrula')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅')
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: `✅ **Doğrulama paneli kuruldu!** Tıklayan üyelere <@&${verilecekRol.id}> rolü verilecek.`, flags: MessageFlags.Ephemeral });
        }

        // 🤖 4. OTO ROL AYARLAMA (/otorol-ayarla)
        else if (commandName === 'otorol-ayarla') {
            const rol = interaction.options.getRole('rol');
            otoRolAyarlari.set(interaction.guild.id, rol.id);
            await interaction.reply({ content: `✅ **Oto Rol Ayarlandı:** Yeni katılan kişilere <@&${rol.id}> rolü verilecek.`, flags: MessageFlags.Ephemeral });
        }

        // 🏰 5. SUNUCU BİLGİ (/sunucubilgi)
        else if (commandName === 'sunucubilgi') {
            const guild = interaction.guild;
            const embed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle(`🏰 **${guild.name.toUpperCase()} | Sunucu Bilgileri**`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: '🆔 Sunucu ID', value: `\`${guild.id}\``, inline: true },
                    { name: '👑 Sunucu Sahibi', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '👥 Toplam Üye', value: `\`${guild.memberCount}\``, inline: true },
                    { name: '📅 Kuruluş Tarihi', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }
                )
                .setFooter({ text: `Sorgulayan: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        // 🎁 6. ÇEKİLİŞ START (/cekilis)
        else if (commandName === 'cekilis') {
            const odul = interaction.options.getString('odul');
            const sureDakika = interaction.options.getInteger('sure');

            const bitisZamani = Math.floor((Date.now() + sureDakika * 60 * 1000) / 1000);

            const embed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('🎉 **ÇEKİLİŞ BAŞLADI** 🎉')
                .setDescription(`🏆 **Ödül:** \`${odul}\`\n⏰ **Bitiş Süresi:** <t:${bitisZamani}:R>\n👤 **Düzenleyen:** <@${interaction.user.id}>`)
                .setFooter({ text: 'Çekilişe katılmak için aşağıdaki butona basın!' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('cekilis_katil')
                    .setLabel('Çekilişe Katıl (0)')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎁')
            );

            await interaction.reply({ content: '✅ Çekiliş başarıyla başlatıldı!', flags: MessageFlags.Ephemeral });
            const mesaj = await interaction.channel.send({ embeds: [embed], components: [row] });

            cekilisler.set(mesaj.id, {
                katilanlar: new Set(),
                odul: odul
            });

            setTimeout(async () => {
                const veriler = cekilisler.get(mesaj.id);
                if (!veriler) return;

                const katilanDizisi = Array.from(veriler.katilanlar);
                let kazananMetni = 'Yeterli katılım olmadığı için kazanan seçilemedi.';

                if (katilanDizisi.length > 0) {
                    const rastgeleKazanan = katilanDizisi[Math.floor(Math.random() * katilanDizisi.length)];
                    kazananMetni = `<@${rastgeleKazanan}>`;
                }

                const bitisEmbed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle('🎉 **ÇEKİLİŞ BİTTİ** 🎉')
                    .setDescription(`🏆 **Ödül:** \`${veriler.odul}\`\n👑 **Kazanan:** ${kazananMetni}\n👥 **Toplam Katılımcı:** \`${katilanDizisi.length}\``)
                    .setTimestamp();

                await mesaj.edit({ embeds: [bitisEmbed], components: [] }).catch(() => {});
                if (katilanDizisi.length > 0) {
                    await mesaj.reply({ content: `🎉 Tebrikler ${kazananMetni}! **${veriler.odul}** ödülünü kazandınız!` });
                }
                cekilisler.delete(mesaj.id);
            }, sureDakika * 60 * 1000);
        }

        // 📊 7. OYLAMA START (/oylama)
        else if (commandName === 'oylama') {
            const soru = interaction.options.getString('soru');
            const sureDakika = interaction.options.getInteger('sure');

            const bitisZamani = Math.floor((Date.now() + sureDakika * 60 * 1000) / 1000);

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('📊 **CANLI OYLAMA**')
                .setDescription(`📌 **Soru:** ${soru}\n⏰ **Bitiş:** <t:${bitisZamani}:R>\n\n✅ **Evet:** \`0\`\n❌ **Hayır:** \`0\``)
                .setFooter({ text: 'Oyunuzu kullanmak için aşağıdaki butonlara basın!' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('oy_evet').setLabel('Evet (0)').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('oy_hayir').setLabel('Hayır (0)').setStyle(ButtonStyle.Danger).setEmoji('❌')
            );

            await interaction.reply({ content: '✅ Oylama başlatıldı!', flags: MessageFlags.Ephemeral });
            const mesaj = await interaction.channel.send({ embeds: [embed], components: [row] });

            oylamalar.set(mesaj.id, {
                soru: soru,
                evet: new Set(),
                hayir: new Set()
            });

            setTimeout(async () => {
                const veri = oylamalar.get(mesaj.id);
                if (!veri) return;

                const bitisEmbed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('📊 **OYLAMA TAMAMLANDI**')
                    .setDescription(`📌 **Soru:** ${veri.soru}\n\n✅ **Evet:** \`${veri.evet.size}\` Oy\n❌ **Hayır:** \`${veri.hayir.size}\` Oy`)
                    .setTimestamp();

                await mesaj.edit({ embeds: [bitisEmbed], components: [] }).catch(() => {});
                oylamalar.delete(mesaj.id);
            }, sureDakika * 60 * 1000);
        }
    }

    // --- BUTON ETKİLEŞİMLERİ ---
    else if (interaction.isButton()) {
        const { customId, guild, member, user, message } = interaction;

        // ✅ VERIFY BUTONU
        if (customId.startsWith('verify_button_')) {
            const rolId = customId.split('verify_button_')[1];
            const rol = guild.roles.cache.get(rolId);

            if (!rol) {
                return interaction.reply({ content: '❌ **HATA:** Atanacak rol bulunamadı.', flags: MessageFlags.Ephemeral });
            }

            if (member.roles.cache.has(rol.id)) {
                return interaction.reply({ content: 'ℹ️ Zaten bu role sahipsiniz.', flags: MessageFlags.Ephemeral });
            }

            try {
                await member.roles.add(rol);
                await interaction.reply({ content: `🎉 **Başarıyla Doğrulandınız!** <@&${rol.id}> rolü tanımlandı.`, flags: MessageFlags.Ephemeral });
            } catch (err) {
                await interaction.reply({ content: '❌ **HATA:** Rol verilemedi. Bot rolünün yetkisini kontrol edin.', flags: MessageFlags.Ephemeral });
            }
        }

        // 🎁 ÇEKİLİŞ BUTONU
        else if (customId === 'cekilis_katil') {
            const veri = cekilisler.get(message.id);
            if (!veri) return interaction.reply({ content: '❌ Çekiliş süresi doldu.', flags: MessageFlags.Ephemeral });

            if (veri.katilanlar.has(user.id)) {
                veri.katilanlar.delete(user.id);
                await interaction.reply({ content: '❌ Çekilişten ayrıldınız.', flags: MessageFlags.Ephemeral });
            } else {
                veri.katilanlar.add(user.id);
                await interaction.reply({ content: '🎉 Çekilişe katıldınız!', flags: MessageFlags.Ephemeral });
            }

            const guncelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('cekilis_katil')
                    .setLabel(`Çekilişe Katıl (${veri.katilanlar.size})`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎁')
            );

            await message.edit({ components: [guncelRow] }).catch(() => {});
        }

        // 📊 OYLAMA BUTONLARI (EVET / HAYIR)
        else if (customId === 'oy_evet' || customId === 'oy_hayir') {
            const veri = oylamalar.get(message.id);
            if (!veri) return interaction.reply({ content: '❌ Oylama süresi doldu.', flags: MessageFlags.Ephemeral });

            if (customId === 'oy_evet') {
                veri.hayir.delete(user.id);
                veri.evet.add(user.id);
            } else {
                veri.evet.delete(user.id);
                veri.hayir.add(user.id);
            }

            await interaction.reply({ content: '✅ Oyunuz kaydedildi!', flags: MessageFlags.Ephemeral });

            const guncelEmbed = EmbedBuilder.from(message.embeds[0])
                .setDescription(`📌 **Soru:** ${veri.soru}\n⏰ **Oylama Devam Ediyor...**\n\n✅ **Evet:** \`${veri.evet.size}\`\n❌ **Hayır:** \`${veri.hayir.size}\``);

            const guncelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('oy_evet').setLabel(`Evet (${veri.evet.size})`).setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('oy_hayir').setLabel(`Hayır (${veri.hayir.size})`).setStyle(ButtonStyle.Danger).setEmoji('❌')
            );

            await message.edit({ embeds: [guncelEmbed], components: [guncelRow] }).catch(() => {});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

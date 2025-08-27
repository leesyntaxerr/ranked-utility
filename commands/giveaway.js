const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const STORAGE_FILE = path.join(__dirname, '..', 'giveaways.json');

// Parses duration strings like "1h30m", "45m", "2d" -> milliseconds
function parseDuration(str) {
    const regex = /(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i;
    const [, d, h, m, s] = str.match(regex) || [];
    const days = parseInt(d) || 0;
    const hours = parseInt(h) || 0;
    const mins = parseInt(m) || 0;
    const secs = parseInt(s) || 0;
    return (((days * 24 + hours) * 60 + mins) * 60 + secs) * 1000;
}

function saveStore(client){
    const arr = Array.from((client.giveaways ?? new Map()).values()).map(g => ({
        ...g,
        entries: Array.from(g.entries),
    }));
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(arr, null, 2));
}

function loadStore(client){
    if (!fs.existsSync(STORAGE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    client.giveaways = new Map();
    for (const g of data){
        g.entries = new Set(g.entries);
        client.giveaways.set(g.messageId, g);
        // schedule if still active
        if (!g.ended){
            const delay = g.endTs - Date.now();
            if (delay > 0){
                setTimeout(()=>endGiveaway(client,g), delay);
            } else {
                // already past, end immediately
                endGiveaway(client, g);
            }
        }
    }
}

module.exports = {
    loadStore,

    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Start or manage giveaways')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s =>
            s.setName('start')
                .setDescription('Start a new giveaway')
                .addStringOption(o => o.setName('prize').setDescription('Giveaway prize').setRequired(true))
                .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 1h30m, 2d)').setRequired(true))
                .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20).setRequired(false))
                .addChannelOption(o => o.setName('channel').setDescription('Channel to host giveaway').setRequired(false))
                .addRoleOption(o => o.setName('role_req').setDescription('Role required to enter').setRequired(false))
        )
        .addSubcommand(s =>
            s.setName('end')
                .setDescription('End a giveaway early')
                .addStringOption(o => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        )
        .addSubcommand(s =>
            s.setName('reroll')
                .setDescription('Pick new winner(s)')
                .addStringOption(o => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        )
        .addSubcommand(s =>
            s.setName('import')
                .setDescription('Import an existing giveaway message after bot restart')
                .addStringOption(o => o.setName('message_id').setDescription('Message ID of giveaway').setRequired(true))
                .addChannelOption(o => o.setName('channel').setDescription('Channel containing the message').setRequired(true))
                .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20).setRequired(false))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const client = interaction.client;
        client.giveaways = client.giveaways ?? new Map();

        if (sub === 'start') {
            const prize = interaction.options.getString('prize');
            const durationStr = interaction.options.getString('duration');
            const durationMs = parseDuration(durationStr);
            if (!durationMs || durationMs < 5000) return interaction.reply({ content: 'Invalid duration.', ephemeral: true });
            const winners = interaction.options.getInteger('winners') ?? 1;
            const channel = interaction.options.getChannel('channel') ?? interaction.channel;
            const roleReq = interaction.options.getRole('role_req');

            const endTs = Date.now() + durationMs;
            const embed = new EmbedBuilder()
                .setTitle(`🎉 ${prize}`)
                .setDescription(`React with the button below to enter!\nTime: <t:${Math.floor(endTs/1000)}:R>\nHosted by: ${interaction.user}${roleReq ? `\nRequired Role: ${roleReq}` : ''}`)
                .setColor('Random')
                .setFooter({ text: `${winners} winner(s)` });

            const btn = new ButtonBuilder()
                .setCustomId('gw-enter')
                .setEmoji('🎉')
                .setLabel('Enter')
                .setStyle(ButtonStyle.Primary);
            const row = new ActionRowBuilder().addComponents(btn);

            const msg = await channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: `Giveaway started in ${channel}!`, ephemeral: true });

            // store giveaway data
            client.giveaways.set(msg.id, {
                messageId: msg.id,
                channelId: channel.id,
                prize,
                winners,
                endTs,
                hostId: interaction.user.id,
                roleReqId: roleReq?.id ?? null,
                entries: new Set(),
                ended: false,
            });

            saveStore(client);
            // schedule end
            setTimeout(async () => {
                const g = client.giveaways.get(msg.id);
                if (!g || g.ended) return;
                await endGiveaway(client, g);
            }, durationMs);
        }
        else if (sub === 'import') {
            const messageId = interaction.options.getString('message_id');
            const chan = interaction.options.getChannel('channel');
            const winners = interaction.options.getInteger('winners') ?? 1;
            let msg;
            try {
                msg = await chan.messages.fetch(messageId);
            } catch {
                return interaction.reply({ content: 'Message not found.', ephemeral: true });
            }
            const embed = msg.embeds[0];
            if (!embed) return interaction.reply({ content: 'Message has no embed.', ephemeral: true });

            const prize = embed.title?.replace('🎉 ', '') || 'Prize';
            // try grab end timestamp from description <t:xxxx:R>
            const tsMatch = embed.description?.match(/<t:(\d+):R>/);
            const endTs = tsMatch ? parseInt(tsMatch[1])*1000 : Date.now()+3600000; // default 1h if unknown

            client.giveaways.set(messageId, {
                messageId,
                channelId: chan.id,
                prize,
                winners,
                endTs,
                hostId: interaction.user.id,
                roleReqId: null,
                entries: new Set(),
                ended: false,
            });
            saveStore(client);
            const delay = endTs - Date.now();
            if (delay > 0) setTimeout(()=>endGiveaway(client, client.giveaways.get(messageId)), delay);
            interaction.reply({ content: 'Giveaway imported and active.', ephemeral: true });
        }
        else if (sub === 'end' || sub === 'reroll') {
            const messageId = interaction.options.getString('message_id');
            const g = client.giveaways.get(messageId);
            if (!g) return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
            if (sub === 'end' && !g.ended) {
                await endGiveaway(client, g);
                saveStore(client);
                interaction.reply({ content: 'Giveaway ended.', ephemeral: true });
            } else if (sub === 'reroll' && g.ended) {
                await pickWinners(client, g, true);
                saveStore(client);
                interaction.reply({ content: 'Rerolled winner(s).', ephemeral: true });
            } else {
                interaction.reply({ content: 'Action cannot be performed.', ephemeral: true });
            }
        }
    },
};

async function endGiveaway(client, g) {
    g.ended = true;
    await pickWinners(client, g, false);
}

async function pickWinners(client, g, announceOnly) {
    const channel = await client.channels.fetch(g.channelId).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(g.messageId).catch(() => null);
    if (!msg) return;

    const participants = Array.from(g.entries);
    if (participants.length === 0) {
        const embed = EmbedBuilder.from(msg.embeds[0])
            .setDescription('No valid entries, giveaway cancelled.');
        await msg.edit({ embeds: [embed], components: [] });
        return;
    }

    const shuffled = participants.sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, g.winners);
    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

    const embed = EmbedBuilder.from(msg.embeds[0])
        .setDescription(`Winner(s): ${winnerMentions}\nPrize: **${g.prize}**`)
        .setFooter({ text: 'Giveaway Ended' });
    await msg.edit({ embeds: [embed], components: [] });

    if (!announceOnly) channel.send(`🎉 Congratulations ${winnerMentions}! You won **${g.prize}**`);
}

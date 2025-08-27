const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, EmbedBuilder, AuditLogEvent, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials } = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const { token } = require('./config.json');
const TicketSystem = require('./utils/ticket-system');
const StatsManager = require('./utils/stats-manager');

// Define the log channel name
const logChannelName = 'server-logs';
const pppLogChannelName = 'ppp-logs';
const ticketLogChannelName = 'ticket-log';
const supportRoleIds = [
    '1378827154782945382',
    '1378827463483723866',
    '1378827514926862446',
    '1378827095668424805'
];
const ticketCategoryId = '1387881688251633827';
const openTickets = new Set(); // To prevent duplicate tickets

const pppRoleIds = new Set([
    '1379462699364126782', // Pups
    '1379462738471813120', // Pugs
    '1379462796697407569'  // Premium
]);

// PPP vote configuration
const PPP_CONFIG = {
    voteDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
    forceStopRoles: [
        '1379518462790996108', // PUGS manager
        '1379518503182405682', // PUGS manager
        '1379518550791688274'  // Premium manager
    ]
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
        Partials.Reaction
    ]
});

// Initialize ticket system
client.ticketSystem = new TicketSystem(client);

// Command handler setup
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

// Helper function to send logs
async function sendLog(guild, embed) {
    const logChannel = guild.channels.cache.find(channel => channel.name === logChannelName);
    if (logChannel) {
        try {
            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Could not send log to #${logChannelName}:`, error);
        }
    } 
}

// Helper function to send ppp logs
async function sendPppLog(guild, embed) {
    const logChannel = guild.channels.cache.find(channel => channel.name === pppLogChannelName);
    if (logChannel) {
        try {
            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Could not send log to #${pppLogChannelName}:`, error);
        }
    }
}

// Bot ready event
const { loadStore } = require('./commands/giveaway');
client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    // Check for log channel on startup
    const guild = client.guilds.cache.first(); // Assumes the bot is in one server
    // Load persistent giveaways
    loadStore(client);

    if (guild) {
        if (!guild.channels.cache.some(channel => channel.name === logChannelName)) {
            console.warn(`Warning: Log channel #${logChannelName} not found in ${guild.name}.`);
        }
        if (!guild.channels.cache.some(channel => channel.name === pppLogChannelName)) {
            console.warn(`Warning: Log channel #${pppLogChannelName} not found in ${guild.name}.`);
        }
    }
});

// Interaction handler
client.on('interactionCreate', async interaction => {
    // Handle button interactions for ticket system
    if (interaction.isButton()) {
        const { customId } = interaction;
        
        // Handle rating buttons
        if (customId.startsWith('rate-')) {
            const [, staffId, scoreStr] = customId.split('-');
            const score = parseInt(scoreStr, 10);
            if (isNaN(score) || score < 1 || score > 5) {
                return interaction.reply({ content: '❌ Invalid rating value.', ephemeral: true });
            }
            try {
                StatsManager.addRating(staffId, score);
                const { avgRating } = StatsManager.getStats(staffId);

                // Set cooldown for the user who rated
                const cooldowns = interaction.client.cooldowns || new Map();
                const cooldownEnd = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
                cooldowns.set(interaction.user.id, cooldownEnd);
                interaction.client.cooldowns = cooldowns;

                // Disable buttons after rating
                const disabledRows = interaction.message.components.map(row => {
                    const newRow = ActionRowBuilder.from(row);
                    newRow.components = newRow.components.map(comp => ButtonBuilder.from(comp).setDisabled(true));
                    return newRow;
                });

                const thanksEmbed = new EmbedBuilder()
                    .setColor('Green')
                    .setDescription(`✅ Thanks for rating! You gave **${score}⭐** to <@${staffId}>.\nCurrent average rating: **${avgRating.toFixed(2)}⭐**`);

                return interaction.update({ embeds: [thanksEmbed], components: disabledRows });
            } catch (err) {
                console.error('Error processing rating:', err);
                return interaction.reply({ content: '❌ Failed to record your rating.', ephemeral: true });
            }
        }

        // Handle ticket close button
        if (customId === 'ticket-close') {
            return client.ticketSystem.closeTicket(interaction, 'Closed via button');
        }
        
        // Handle ticket claim button
        if (customId === 'ticket-claim') {
            // Create a safe reply function that handles all response states
            const safeReply = async (options) => {
                try {
                    if (interaction.replied) {
                        return await interaction.followUp({ ...options, ephemeral: options.ephemeral ?? true });
                    } else if (interaction.deferred) {
                        return await interaction.editReply(options);
                    } else {
                        return await interaction.reply({ ...options, fetchReply: true });
                    }
                } catch (error) {
                    console.error('Error in safeReply:', error);
                    return null;
                }
            };

            // Early exit if channel is invalid
            if (!interaction.channel?.id) {
                console.error('Invalid channel in ticket claim');
                return safeReply({
                    content: '❌ Error: Invalid channel',
                    ephemeral: true
                });
            }

            // Defer the reply immediately to prevent interaction timeout
            if (!interaction.deferred && !interaction.replied) {
                try {
                    await interaction.deferReply({ ephemeral: true });
                } catch (error) {
                    console.error('Failed to defer reply:', error);
                }
            }

            try {
                const ticketData = client.ticketSystem?.activeTickets?.get(interaction.channel.id);
                
                // Validate ticket data structure
                if (!ticketData || typeof ticketData !== 'object') {
                    console.error('Invalid or missing ticket data:', { channelId: interaction.channel.id, ticketData });
                    return safeReply({
                        content: '❌ This is not a valid ticket channel or the ticket data is corrupted.',
                        ephemeral: true
                    });
                }

                // Ensure staffRoles exists and is an array
                if (!Array.isArray(ticketData.staffRoles)) {
                    console.log('Initializing empty staffRoles array for ticket');
                    ticketData.staffRoles = [];
                    client.ticketSystem.saveTickets();
                }

                // Check if already claimed
                if (ticketData.claimedBy) {
                    if (ticketData.claimedBy === interaction.user.id) {
                        return safeReply({
                            content: 'ℹ️ You have already claimed this ticket!',
                            ephemeral: true
                        });
                    }
                    return safeReply({
                        content: `❌ This ticket is already claimed by <@${ticketData.claimedBy}>.`,
                        ephemeral: true
                    });
                }

                // Check if user has staff role or admin permissions
                const { ticket: TICKET_SETTINGS } = require('./config.json');
                const combinedStaffRoles = [...new Set([
                    ...(Array.isArray(ticketData.staffRoles) ? ticketData.staffRoles : []),
                    ...TICKET_SETTINGS.globalStaffRoles
                ])];

                const hasStaffRole = combinedStaffRoles.some(roleId =>
                    interaction.member.roles.cache.has(roleId)
                );
                
                const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
                
                if (!hasStaffRole && !isAdmin) {
                    return safeReply({
                        content: '❌ You do not have permission to claim tickets.',
                        ephemeral: true
                    });
                }

                // Claim the ticket
                ticketData.claimedBy = interaction.user.id;
                ticketData.status = 'claimed';
                ticketData.lastActivity = Date.now();
                client.ticketSystem.saveTickets();

                // Record stats
                const responseMs = Date.now() - (ticketData.createdAt || Date.now());
                StatsManager.recordClaim(interaction.user.id, responseMs);

                // Remove channel access for other staff roles (except the claimer)
                try {
                    const { ticket: TICKET_SETTINGS } = require('./config.json');
                    // Combine category-specific and global staff roles
                    const allStaffRoles = [...new Set([
                        ...(Array.isArray(ticketData.staffRoles) ? ticketData.staffRoles : []),
                        ...TICKET_SETTINGS.globalStaffRoles
                    ])];

                    // Iterate over each staff role and revoke access if the claimer does not have that role
                    for (const roleId of allStaffRoles) {
                        if (!interaction.member.roles.cache.has(roleId)) {
                            await interaction.channel.permissionOverwrites.edit(roleId, {
                                ViewChannel: false,
                                SendMessages: false,
                                AttachFiles: false,
                                ReadMessageHistory: false
                            }).catch(()=>{});
                        }
                    }
                } catch (permErr) {
                    console.error('Failed to update permissions after claim:', permErr);
                }
                
                // Update the ticket message with claim info if it exists
                try {
                    const messages = await interaction.channel.messages.fetch({ limit: 10 });
                    const ticketMessage = messages.find(m => 
                        m.embeds.length > 0 && 
                        m.embeds[0].description && 
                        m.embeds[0].description.includes('Thank you for creating a ticket')
                    );

                    if (ticketMessage) {
                        const embed = ticketMessage.embeds[0];
                        const newEmbed = EmbedBuilder.from(embed)
                            .setFields([
                                { name: 'Status', value: '🔹 In Progress', inline: true },
                                { name: 'Claimed By', value: interaction.user.toString(), inline: true },
                                { name: 'Opened By', value: `<@${ticketData.userId}>`, inline: true }
                            ]);
                        
                        await ticketMessage.edit({ embeds: [newEmbed] });
                    }
                } catch (error) {
                    console.error('Error updating ticket message:', error);
                    // Continue even if message update fails
                }
                
                const claimEmbed = new EmbedBuilder()
                    .setDescription(`✅ ${interaction.user} has claimed this ticket`)
                    .setColor('#FEE75C');
                
                const response = {
                    content: `<@${ticketData.userId}> ${interaction.user} has claimed your ticket!`,
                    embeds: [claimEmbed]
                };
                
                if (interaction.replied) {
                    return interaction.followUp(response);
                } else if (interaction.deferred) {
                    return interaction.editReply(response);
                } else {
                    return interaction.reply(response);
                }
                
            } catch (error) {
                console.error('Error in ticket claim handler:', error);
                try {
                    const errorResponse = {
                        content: '❌ An error occurred while processing your request. Please try again later.',
                        ephemeral: true
                    };
                    
                    if (interaction.replied) {
                        return interaction.followUp(errorResponse);
                    } else if (interaction.deferred) {
                        return interaction.editReply(errorResponse);
                    } else {
                        return interaction.reply(errorResponse);
                    }
                } catch (e) {
                    console.error('Failed to send error response:', e);
                }
            }
        }
    }
    
    // Handle select menu interactions (for ticket creation)
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket-create') {
            const category = interaction.values[0];
            return client.ticketSystem.createTicket(interaction, category);
        }
    }

    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error('Error executing command:', error);
            const reply = { 
                content: 'There was an error while executing this command!', 
                ephemeral: true 
            };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket-create') {
            await interaction.deferReply({ ephemeral: true });

            const user = interaction.user;
            const guild = interaction.guild;
            const categoryValue = interaction.values[0];

            if (openTickets.has(user.id)) {
                return interaction.editReply({ content: 'You already have an open ticket.' });
            }

            openTickets.add(user.id);

            try {
                const channel = await guild.channels.create({
                    name: `ticket-${user.username}`,
                    type: ChannelType.GuildText,
                    parent: ticketCategoryId,
                    topic: `Ticket for ${user.id}. Category: ${categoryValue}`,
                    permissionOverwrites: [
                        { 
                            id: guild.id, 
                            deny: [PermissionsBitField.Flags.ViewChannel] 
                        },
                        { 
                            id: user.id, 
                            allow: [
                                PermissionsBitField.Flags.ViewChannel, 
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.AttachFiles,
                                PermissionsBitField.Flags.EmbedLinks,
                                PermissionsBitField.Flags.ReadMessageHistory
                            ] 
                        },
                        // Add support role permissions
                        {
                            id: '1378827154782945382', // Support role ID
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.AttachFiles,
                                PermissionsBitField.Flags.EmbedLinks,
                                PermissionsBitField.Flags.ReadMessageHistory,
                                PermissionsBitField.Flags.ManageMessages
                            ]
                        },
                        // Add additional support roles if any
                        ...(supportRoleIds || []).map(id => ({ 
                            id, 
                            allow: [
                                PermissionsBitField.Flags.ViewChannel, 
                                PermissionsBitField.Flags.SendMessages
                            ] 
                        }))
                    ],
                });

                const ticketEmbed = new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('📩 Ticket Created!')
                    .setDescription(`Please wait, our support team will be with you shortly.\n\n**Category:** ${categoryValue.charAt(0).toUpperCase() + categoryValue.slice(1)}`);

                const closeButton = new ButtonBuilder()
                    .setCustomId('ticket-close')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒');

                const row = new ActionRowBuilder().addComponents(closeButton);

                await channel.send({ content: `Welcome ${user}!`, embeds: [ticketEmbed], components: [row] });

                await interaction.editReply({ content: `Your ticket has been created: ${channel}` });

            } catch (error) {
                console.error('Error creating ticket channel:', error);
                openTickets.delete(user.id);
                await interaction.editReply({ content: 'There was an error creating your ticket.' });
            }
        }
        else if (interaction.customId === 'rr-select') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const member = interaction.member;
                const selected = new Set(interaction.values);
                const roleMap = {
                    '1379470600103268396': 'Events',
                    '1379470638926008440': 'Giveaways',
                    '1387881386295296060': 'Affiliates',
                    '1379472855976120453': 'Updates',
                    '1387881468386087074': 'Queue Ping',
                    '1379507264959938590': 'Announcements',
                };
                const changes = [];
                for (const [roleId, name] of Object.entries(roleMap)) {
                    if (selected.has(roleId) && !member.roles.cache.has(roleId)) {
                        await member.roles.add(roleId);
                        changes.push(`+ ${name}`);
                    } else if (!selected.has(roleId) && member.roles.cache.has(roleId)) {
                        await member.roles.remove(roleId);
                        changes.push(`- ${name}`);
                    }
                }
                const msg = changes.length ? `Updated roles:\n${changes.join('\n')}` : 'No changes to your roles.';
                await interaction.editReply({ content: msg });
            } catch (error) {
                console.error('Error handling rr-select:', error);
                await interaction.editReply({ content: 'There was an error updating your roles.' });
            }
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'gw-enter') {
            const g = interaction.client.giveaways?.get(interaction.message.id);
            if (!g || g.ended) return interaction.reply({ content: 'This giveaway is not active.', ephemeral: true });
            if (g.roleReqId && !interaction.member.roles.cache.has(g.roleReqId)) {
                return interaction.reply({ content: 'You do not meet the role requirement to enter.', ephemeral: true });
            }
            if (g.entries.has(interaction.user.id)) {
                g.entries.delete(interaction.user.id);
                await interaction.reply({ content: '❌ You have left the giveaway.', ephemeral: true });
            } else {
                g.entries.add(interaction.user.id);
                await interaction.reply({ content: '✅ You have entered the giveaway!', ephemeral: true });
            }
            // update footer count
            const embed = EmbedBuilder.from(interaction.message.embeds[0])
                .setFooter({ text: `${g.winners} winner(s) | Entries: ${g.entries.size}` });
            await interaction.message.edit({ embeds: [embed] }).catch(()=>{});
            return;
        }
        if (interaction.customId === 'ticket-close') {
            try {
                console.log(`[TICKET] Close button clicked by ${interaction.user.tag} in channel ${interaction.channel.name}`);
                const channel = interaction.channel;
                const logChannel = channel.guild.channels.cache.find(c => c.name === ticketLogChannelName);

                if (!logChannel) {
                    console.error(`[TICKET] Log channel #${ticketLogChannelName} not found!`);
                    await interaction.reply({ content: `Error: Log channel #${ticketLogChannelName} not found. Please contact an admin.`, ephemeral: true });
                    return;
                }
                console.log(`[TICKET] Found log channel: ${logChannel.name}`);

                await interaction.reply({ content: 'Closing ticket and saving transcript...', ephemeral: true });

                console.log(`[TICKET] Generating transcript for ${channel.name}...`);
                const attachment = await discordTranscripts.createTranscript(channel, {
                    limit: -1,
                    returnType: 'attachment',
                    filename: `${channel.name}-transcript.html`,
                    saveImages: true,
                    poweredBy: false
                });
                console.log(`[TICKET] Transcript generated successfully.`);

                const ticketCreatorId = channel.topic.match(/(\d+)/)[0];
                const ticketCreator = await client.users.fetch(ticketCreatorId);

                const embed = new EmbedBuilder()
                    .setColor('Blue')
                    .setTitle('Ticket Closed')
                    .addFields(
                        { name: 'Ticket Name', value: channel.name, inline: true },
                        { name: 'Opened By', value: ticketCreator.toString(), inline: true },
                        { name: 'Closed By', value: interaction.user.toString(), inline: true },
                    )
                    .setTimestamp();
                
                console.log(`[TICKET] Sending transcript to #${logChannel.name}...`);
                await logChannel.send({ embeds: [embed], files: [attachment] });
                console.log(`[TICKET] Transcript sent successfully.`);

                const userId = channel.topic.match(/(\d+)/)[0];
                openTickets.delete(userId);
                
                console.log(`[TICKET] Deleting channel ${channel.name}...`);
                await channel.delete('Ticket closed.');

            } catch (error) {
                console.error('[TICKET] An error occurred during ticket closing:', error);
                try {
                    // Use editReply or followUp depending on whether the initial reply was successful
                    if (interaction.replied || interaction.deferred) {
                        await interaction.editReply({ content: 'An error occurred while closing the ticket. Please check the console.' });
                    } else {
                        await interaction.reply({ content: 'An error occurred while closing the ticket. Please check the console.', ephemeral: true });
                    }
                } catch (e) {
                    console.error('[TICKET] Failed to send error follow-up message:', e);
                }
            }
        }
    }
        else if (interaction.customId.startsWith('ppp-vote-')) {
            const parts = interaction.customId.split('-'); // ['ppp','vote','yes|no','<userId>']
            const decision = parts[2];
            const targetId = parts[3];
            // Reply ephemerally to acknowledge the button press
            let targetUser;
            try {
                targetUser = await client.users.fetch(targetId);
            } catch (err) {
                console.error('Failed to fetch target user for vote:', err);
            }

            const voteEmoji = decision === 'yes' ? '✅' : '❎';
            const voteText = decision === 'yes' ? 'in favour of' : 'against';
            const username = targetUser ? targetUser.tag : 'the user';

            await interaction.reply({
                content: `${voteEmoji} You voted ${voteText} giving the role to ${username}.`,
                ephemeral: true,
            });

            const logChannel = interaction.guild.channels.cache.find(c => c.name === pppLogChannelName);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor(decision === 'yes' ? 'Green' : 'Red')
                    .setTitle('PPP Role Vote Cast')
                    .setDescription(`${interaction.user} voted ${voteText} giving the role to <@${targetId}> (${decision.toUpperCase()})`)
                    .setTimestamp();
                logChannel.send({ embeds: [embed] }).catch(console.error);
            }
        }
});

// --- PPP VOTE BUTTON HANDLER ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('ppp-vote-')) return;

    const parts = interaction.customId.split('-');

    // Determine if this button is a force-stop or a normal vote
    const isForceStop = interaction.customId.endsWith('-force-stop');

    // Determine action and relevant identifiers
    let action = isForceStop ? 'force-stop' : 'vote';
    let decision = isForceStop ? null : parts[2]; // decision is only relevant for normal votes
    let targetId = isForceStop ? parts[parts.length - 2] : parts[3];

    let targetUser = null;
    if (action !== 'force-stop') {
        try {
            targetUser = await interaction.client.users.fetch(targetId);
        } catch (err) {
            console.error('Failed to fetch target user for vote:', err);
        }
    }

    // Check if this is a force stop action
    if (action === 'force-stop') {
        // Get the vote session to determine the vote type
        const voteSession = interaction.client.pppVoteSessions?.get(interaction.message.id);
        if (!voteSession) {
            return interaction.reply({
                content: '❌ This vote session no longer exists.',
                ephemeral: true
            });
        }

        // Check if user has permission to force stop based on vote type
        const hasRole = interaction.member.roles.cache.some(role => 
            PPP_CONFIG.forceStopRoles.includes(role.id)
        );
        console.log(`[DEBUG] User has force stop permission: ${hasRole}`);

        if (!hasRole) {
            return interaction.reply({
                content: '❌ You do not have permission to force stop this vote.',
                ephemeral: true
            });
        }

        // Get the vote session
        const session = interaction.client.pppVoteSessions?.get(interaction.message.id);
        if (!session) {
            return interaction.reply({
                content: '❌ This vote has already ended.',
                ephemeral: true
            });
        }

        // Calculate results
        const yesCount = session.yes.size;
        const noCount = session.no.size;
        const total = yesCount + noCount;

        // Update message with results
        const originalEmbed = interaction.message.embeds[0];
        const embed = EmbedBuilder.from(originalEmbed)
            .setDescription(`**Final Results**\n` +
                `Yes: ${yesCount} 👍\n` +
                `No: ${noCount} 👎\n` +
                `Total: ${total} votes\n` +
                `Force stopped by: ${interaction.user.tag}`)
            .setColor('#FF0000')
            .setTitle('Vote Force Stopped');

        // Update message and clear session
        await interaction.message.edit({
            embeds: [embed],
            components: []
        });
        interaction.client.pppVoteSessions.delete(interaction.message.id);

        // Log the force stop
        const logChannel = interaction.guild.channels.cache.find(c => c.name === pppLogChannelName);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('PPP Vote Force Stopped')
                .setDescription(`Vote for <@${targetId}> was force stopped by ${interaction.user}\n` +
                    `Final Results: ${yesCount} 👍 - ${noCount} 👎`)
                .setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(console.error);
        }

        return interaction.reply({
            content: '✅ Vote has been force stopped successfully.',
            ephemeral: true
        });
    }

    // Handle regular vote
    const voteEmoji = decision === 'yes' ? '✅' : '❎';
    const voteText = decision === 'yes' ? 'in favour of' : 'against';
    const username = targetUser ? targetUser.tag : 'the user';

    // track vote
    const session = interaction.client.pppVoteSessions?.get(interaction.message.id);
    if (session) {
        const voterSet = decision === 'yes' ? session.yes : session.no;
        const oppositeSet = decision === 'yes' ? session.no : session.yes;
        
        // Check if user has already voted
        if (voterSet.has(interaction.user.id)) {
            return interaction.reply({
                content: `❌ You have already voted ${voteText} ${username}.`,
                ephemeral: true
            });
        }
        
        // Remove user from opposite set if they're switching votes
        if (oppositeSet.has(interaction.user.id)) {
            oppositeSet.delete(interaction.user.id);
        }
        
        voterSet.add(interaction.user.id);
        oppositeSet.delete(interaction.user.id); // ensure one vote per user

        // update embed footer with counts
        const yesCount = session.yes.size;
        const noCount = session.no.size;
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.setFooter({ text: `✅ ${yesCount}   ❎ ${noCount}` });
        await interaction.message.edit({ embeds: [embed] }).catch(console.error);
    }

    // acknowledge vote
    await interaction.reply({
        content: `${voteEmoji} You voted ${voteText} giving the role to ${username}.`,
        ephemeral: true,
    }).catch(console.error);

    const logChannel = interaction.guild?.channels.cache.find(c => c.name === pppLogChannelName);
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setColor(decision === 'yes' ? 'Green' : 'Red')
            .setTitle('PPP Role Vote Cast')
            .setDescription(`${interaction.user} voted ${voteText} giving the role to <@${targetId}> (${decision.toUpperCase()})`)
            .setTimestamp();
        logChannel.send({ embeds: [embed] }).catch(console.error);
    }
});

// --- VC ACTIVITY TRACKING ---
const BA_ROLE_ID = '1378826987745050815';
const INACTIVITY_CHANNEL_ID = '1386830921893810326';
const REQUIRED_WEEKLY_MS = 7 * 60 * 60 * 1000; // 7 hours

// Maps: userId -> accumulated ms this week
const weeklyVcDuration = new Map();
// Tracks ongoing session start time: userId -> timestamp
const activeVcSessions = new Map();
let lastWeeklyReset = Date.now();

client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || !member.roles.cache.has(BA_ROLE_ID)) return;

    // If joined a VC (old null, new channel id) => start timer
    if (!oldState.channelId && newState.channelId) {
        activeVcSessions.set(member.id, Date.now());
    }
    // If left VC (old channel id, new null)
    else if (oldState.channelId && !newState.channelId) {
        const start = activeVcSessions.get(member.id);
        if (start) {
            const sessionMs = Date.now() - start;
            const prev = weeklyVcDuration.get(member.id) || 0;
            weeklyVcDuration.set(member.id, prev + sessionMs);
            activeVcSessions.delete(member.id);
        }
    }
});

// Weekly checker – runs every 24h
setInterval(async () => {
    const now = Date.now();
    if (now - lastWeeklyReset < 7 * 24 * 60 * 60 * 1000) return;
    lastWeeklyReset = now;

    const guild = client.guilds.cache.first();
    if (!guild) return;
    const logChannel = guild.channels.cache.get(INACTIVITY_CHANNEL_ID);
    if (!logChannel) return;

    for (const [userId, ms] of weeklyVcDuration.entries()) {
        if (ms < REQUIRED_WEEKLY_MS) {
            const user = await guild.members.fetch(userId).catch(() => null);
            if (!user) continue;
            const hours = (ms / 3600000).toFixed(1);
            const embed = new EmbedBuilder()
                .setColor('Yellow')
                .setTitle('Inactivity Alert')
                .setDescription(`${user} has only spent **${hours}h** in playing zyrox rbw this week (minimum **7h** required for Ranked Bedwars). Please be more active!`)
                .setTimestamp();
            logChannel.send({ content: `${user}`, embeds: [embed] }).catch(console.error);
        }
    }
    // reset durations
    weeklyVcDuration.clear();
}, 24 * 60 * 60 * 1000);

// --- LOGGING EVENTS ---

// Member Joins
client.on('guildMemberAdd', member => {
    const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('Member Joined')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: 'Member', value: `${member} (${member.user.tag})`, inline: false },
            { name: 'Account Created', value: `<t:${parseInt(member.user.createdTimestamp / 1000)}:R>`, inline: false },
        )
        .setTimestamp();
    sendLog(member.guild, embed);
});

// Member Leaves
client.on('guildMemberRemove', async member => {
    // Wait a moment for audit logs to update
    await new Promise(resolve => setTimeout(resolve, 500));

    const fetchedLogs = await member.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberKick,
    });
    const kickLog = fetchedLogs.entries.first();

    // If a kick log exists, and it's for the member who just left, log it as a kick
    if (kickLog && kickLog.target.id === member.id && kickLog.createdAt > member.joinedAt) {
        const { executor, reason } = kickLog;
        const embed = new EmbedBuilder()
            .setColor('DarkOrange')
            .setTitle('Member Kicked')
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: 'Member', value: member.user.tag, inline: false },
                { name: 'Moderator', value: executor.toString(), inline: true },
                { name: 'Reason', value: reason || 'No reason provided.', inline: true }
            )
            .setTimestamp();
        return sendLog(member.guild, embed);
    }

    // Otherwise, log it as a regular leave
    const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Member Left')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: 'Member', value: member.user.tag, inline: false },
        )
        .setTimestamp();
    sendLog(member.guild, embed);
});

// Message Deletions
client.on('messageDelete', message => {
    // Ignore partial messages, bot messages, and system messages
    if (message.partial || message.author?.bot || message.system) return;
    
    const embed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('Message Deleted')
        .addFields(
            { name: 'Author', value: message.author.toString(), inline: true },
            { name: 'Channel', value: message.channel.toString(), inline: true },
            { name: 'Content', value: message.content?.trim() || 'No content available.' },
        )
        .setTimestamp();
    sendLog(message.guild, embed);
});

// Message handling for utility features (antilink, autorespond, sticky)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const { load: loadUtil } = require('./commands/utility');
    const util = loadUtil();
    
    // antilink
    if (util.antilink && /(https?:\/\/|discord\.gg)/i.test(message.content) && !message.member?.permissions.has('ManageMessages')) {
        await message.delete().catch(() => {});
        return message.channel.send({ content: `${message.author}, links are not allowed.` })
            .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }
    
    // autorespond
    // Match autorespond keys as whole words (case-insensitive)
        const key = Object.keys(util.autorespond).find(k => {
            const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex meta
            const regex = new RegExp(`\\b${escaped}\\b`, 'i');
            return regex.test(message.content);
        });
    if (key) {
        return message.reply(util.autorespond[key]);
    }

    // sticky upkeep
    const sticky = util.sticky[message.channel.id];
    if (sticky) {
        if (message.id === sticky.messageId) return; // ignore own sticky
        const chan = message.channel;
        chan.messages.fetch(sticky.messageId).catch(async () => {
            const m = await chan.send(sticky.content);
            sticky.messageId = m.id;
            require('fs').writeFileSync(require('path').join(__dirname, 'utility.json'), JSON.stringify(util, null, 2));
        });
    }
});

// Message Edits
client.on('messageUpdate', (oldMessage, newMessage) => {
    // Ignore partial messages, bot messages, system messages, and non-content changes
    if (oldMessage.partial || newMessage.partial || 
        oldMessage.author?.bot || 
        oldMessage.system || 
        oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setColor('Blue')
        .setTitle('Message Edited')
        .addFields(
            { name: 'Author', value: newMessage.author.toString(), inline: false },
            { name: 'Channel', value: newMessage.channel.toString(), inline: false },
            { name: 'Before', value: oldMessage.content.slice(0, 1024) },
            { name: 'After', value: newMessage.content.slice(0, 1024) },
        )
        .setURL(newMessage.url)
        .setTimestamp();
    sendLog(newMessage.guild, embed);
});

// Role Additions/Removals
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    // Check for Mute/Unmute first
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    if (oldTimeout !== newTimeout) {
        const fetchedLogs = await newMember.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberUpdate,
        });
        const muteLog = fetchedLogs.entries.first();
        const moderator = muteLog ? muteLog.executor.toString() : 'Unknown';

        // Muted/Unmuted handling
        if (newTimeout > Date.now()) {
            const embed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('Member Muted')
                .addFields(
                    { name: 'Member', value: newMember.toString(), inline: true },
                    { name: 'Duration', value: `<t:${Math.floor(newTimeout / 1000)}:R>`, inline: true },
                    { name: 'Moderator', value: 'System', inline: true }
                )
                .setTimestamp();
            sendLog(newMember.guild, embed);
        } else if (oldTimeout > Date.now()) {
            const embed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('Member Unmuted')
                .addFields(
                    { name: 'Member', value: newMember.toString(), inline: true },
                    { name: 'Moderator', value: 'System', inline: true }
                )
                .setTimestamp();
            sendLog(newMember.guild, embed);
        }
        return; // Skip further processing for timeouts
    }

    // Find added/removed roles
    const addedRole = newRoles.find(role => !oldRoles.has(role.id));
    const removedRole = oldRoles.find(role => !newRoles.has(role.id));

    // Skip if no role changes
    if (!addedRole && !removedRole) return;

    const role = addedRole || removedRole;
    const isPppRole = role && [
        '1379462699364126782', // Pups
        '1379462699364126783', // Pugs
        '1379462699364126784'  // Premium
    ].includes(role.id);

    // Skip PPP role changes as they're now handled by the commands
    if (isPppRole) {
        // Check if this was a command execution by checking the audit log reason
        try {
            const auditLogs = await newMember.guild.fetchAuditLogs({
                type: removedRole ? AuditLogEvent.MemberRoleRemove : AuditLogEvent.MemberRoleUpdate,
                limit: 5
            });

            const commandLog = auditLogs.entries.find(entry => 
                entry.target?.id === newMember.id &&
                entry.reason?.startsWith('Command executed by') &&
                Date.now() - entry.createdTimestamp < 5000 // Within last 5 seconds
            );

            // If this was a command execution, skip logging as it's already handled
            if (commandLog) {
                return;
            }
        } catch (error) {
            console.error('Error checking audit logs for PPP role change:', error);
        }
    }

    // Default to bot as executor
    let executor = { id: client.user.id, toString: () => client.user.toString() };
    let reason = 'No reason provided';

    // Try to get executor from audit logs for non-PPP roles
    try {
        const auditLogs = await newMember.guild.fetchAuditLogs({
            type: removedRole ? AuditLogEvent.MemberRoleRemove : AuditLogEvent.MemberRoleUpdate,
            limit: 5
        });

        const relevantLog = auditLogs.entries.find(entry => 
            entry.target?.id === newMember.id &&
            entry.changes?.some(change => 
                change.key === '$add' || 
                change.key === '$remove'
            ) &&
            Date.now() - entry.createdTimestamp < 5000 // Within last 5 seconds
        );

        if (relevantLog) {
            reason = relevantLog.reason || 'No reason provided';

            // If the bot made the change, check if it was in response to a command
            if (relevantLog.executor?.id === client.user.id) {
                // Look for recent command usage by real users
                const commandLogs = await newMember.guild.fetchAuditLogs({
                    limit: 10,
                    type: AuditLogEvent.MemberRoleUpdate
                });
                
                // Find the most recent command by a real user that could have triggered this
                const userCommand = Array.from(commandLogs.entries).find(entry => 
                    entry.target?.id === newMember.id &&
                    !entry.executor?.bot &&
                    entry.createdTimestamp > (Date.now() - 5000) // Within last 5 seconds
                );
                
                if (userCommand) {
                    executor = userCommand.executor;
                    reason = userCommand.reason || reason;
                } else {
                    // If we can't find a user command, default to the bot
                    executor = relevantLog.executor;
                }
            } else {
                // If not the bot, use the executor from the log
                executor = relevantLog.executor;
            }
        }
    } catch (error) {
        console.error('Error fetching audit logs:', error);
    }
    
    // If we still don't have an executor, use the bot as fallback
    if (!executor) {
        executor = { id: client.user.id, toString: () => client.user.toString() };
    }

    // Handle PPP role changes
    if (isPppRole) {
        // Check if this was triggered by a command (stored in client.lastRoleCommand)
        const commandInfo = client.lastRoleCommand?.[`${newMember.id}-${role.id}`];
        const actualExecutor = commandInfo?.executor || executor;
        const commandReason = commandInfo?.reason || reason;
        
        // Clear the command info after use (to prevent reuse)
        if (client.lastRoleCommand && commandInfo) {
            delete client.lastRoleCommand[`${newMember.id}-${role.id}`];
        }

        if (addedRole) {
            // If the role was added by anyone other than the bot, revert it.
            if (executor.id !== client.user.id) {
                await newMember.roles.remove(addedRole);

                const embed = new EmbedBuilder()
                    .setColor('Red')
                    .setTitle('Manual Role Change Reverted')
                    .addFields(
                        { name: 'Member', value: newMember.toString(), inline: true },
                        { name: 'Role', value: addedRole.name, inline: true },
                        { name: 'Action By', value: actualExecutor.toString(), inline: true },
                        { name: 'Reason', value: 'This role must be managed via bot commands. The change has been reverted.' }
                    )
                    .setTimestamp();
                sendPppLog(newMember.guild, embed);
                return; // Stop further processing
            } else {
                // Role was added by the bot, log it normally.
                const embed = new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('PPP Role Added')
                    .addFields(
                        { name: 'Member', value: newMember.toString(), inline: true },
                        { name: 'Role', value: addedRole.name, inline: true },
                        { name: 'Moderator', value: actualExecutor.toString(), inline: true },
                        { name: 'Reason', value: commandReason, inline: false }
                    )
                    .setTimestamp();
                sendPppLog(newMember.guild, embed);
            }
        }

        if (removedRole) {
            // Log any removal of a PPP role.
            const embed = new EmbedBuilder()
                .setColor('Orange')
                .setTitle('PPP Role Removed')
                .addFields(
                    { name: 'Member', value: newMember.toString(), inline: true },
                    { name: 'Role', value: removedRole.name, inline: true },
                    { name: 'Moderator', value: executor.toString(), inline: true },
                )
                .setTimestamp();
            sendPppLog(newMember.guild, embed);
        }
    } else { // Handle non-PPP role changes (original logic)
        const moderator = executor ? executor.toString() : 'Unknown';
        if (addedRole) {
            const embed = new EmbedBuilder()
                .setColor('Purple')
                .setTitle('Role Added')
                .addFields(
                    { name: 'Member', value: newMember.toString(), inline: true },
                    { name: 'Role', value: addedRole.name, inline: true },
                    { name: 'Moderator', value: moderator, inline: true },
                )
                .setTimestamp();
            sendLog(newMember.guild, embed);
        }

        if (removedRole) {
            const embed = new EmbedBuilder()
                .setColor('Purple')
                .setTitle('Role Removed')
                .addFields(
                    { name: 'Member', value: newMember.toString(), inline: true },
                    { name: 'Role', value: removedRole.name, inline: true },
                    { name: 'Moderator', value: moderator, inline: true },
                )
                .setTimestamp();
            sendLog(newMember.guild, embed);
        }
    }
});

// Channel Creations
client.on('channelCreate', channel => {
    const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('Channel Created')
        .addFields(
            { name: 'Channel Name', value: channel.name, inline: true },
            { name: 'Channel Type', value: channel.type.toString(), inline: true },
        )
        .setTimestamp();
    sendLog(channel.guild, embed);

    // Auto send /rules after 5 seconds for channels created under the specified category
    try {
        const RULES_CATEGORY_ID = '1388082029186514986';
        if (channel.parentId === RULES_CATEGORY_ID && channel.type === ChannelType.GuildText) {
            setTimeout(() => {
                try {
                    const { EmbedBuilder } = require('discord.js');
                    const embed = new EmbedBuilder()
                        .setTitle('🏆 Season #1 Ruleset')
                        .setColor('Gold')
                        .addFields(
                            { name: 'Always Allowed', value: '✅ Ladder\n✅ Fireballs\n✅ Diamond Armor (2 per team)\n✅ Blue side\n✅ Water at own base\n✅ Fireballing Diamonds' },
                            { name: 'Allowed After Diamond II', value: '⚠️ Invisibility\n⚠️ Jump Boost' },
                            { name: 'Allowed After Bed Break', value: '⚠️ Both Sides\n⚠️ Pearls\n⚠️ Bridge egg' },
                            { name: 'Not Allowed', value: '❌ Knockback Stick\n❌ Bow\n❌ Pop Up Towers\n❌ Silverfish\n❌ Golem' }
                        )
                        .setFooter({ text: 'Please adhere to the rules to avoid penalties.' });
                    channel.send({ embeds: [embed] }).catch(console.error);
                } catch (e) {
                    console.error('Failed to send season rules embed:', e);
                }
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to auto-send /rules:', err);
    }
});

// Channel Deletions
client.on('channelDelete', channel => {
    const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Channel Deleted')
        .addFields(
            { name: 'Channel Name', value: channel.name, inline: true },
        )
        .setTimestamp();
    sendLog(channel.guild, embed);
});

// Member Banned
client.on('guildBanAdd', async ban => {
    // Fetch audit log to find who did it
    const fetchedLogs = await ban.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberBanAdd,
    });
    const banLog = fetchedLogs.entries.first();

    // If we can't find the log, we can't determine who did it.
    if (!banLog) {
        const embed = new EmbedBuilder()
            .setColor('DarkRed')
            .setTitle('Member Banned')
            .setThumbnail(ban.user.displayAvatarURL())
            .addFields(
                { name: 'Member', value: ban.user.tag, inline: false },
                { name: 'Moderator', value: 'Unknown', inline: true },
                { name: 'Reason', value: ban.reason || 'No reason provided.', inline: true }
            )
            .setTimestamp();
        return sendLog(ban.guild, embed);
    }

    const { executor, reason } = banLog;
    const embed = new EmbedBuilder()
        .setColor('DarkRed')
        .setTitle('Member Banned')
        .setThumbnail(ban.user.displayAvatarURL())
        .addFields(
            { name: 'Member', value: ban.user.tag, inline: false },
            { name: 'Moderator', value: executor.toString(), inline: true },
            { name: 'Reason', value: reason || 'No reason provided.', inline: true }
        )
        .setTimestamp();
    sendLog(ban.guild, embed);
});

// Member Unbanned
client.on('guildBanRemove', async ban => {
    // Fetch audit log to find who did it
    const fetchedLogs = await ban.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberBanRemove,
    });
    const unbanLog = fetchedLogs.entries.first();

    const moderator = unbanLog ? unbanLog.executor.toString() : 'Unknown';

    const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('Member Unbanned')
        .setThumbnail(ban.user.displayAvatarURL())
        .addFields(
            { name: 'Member', value: ban.user.tag, inline: false },
            { name: 'Moderator', value: moderator, inline: true }
        )
        .setTimestamp();
    sendLog(ban.guild, embed);
});

console.log('Attempting to log in...');
client.login(token).catch(error => {
    console.error('CRITICAL: Failed to log in. Please check your bot token in config.json.', error);
});

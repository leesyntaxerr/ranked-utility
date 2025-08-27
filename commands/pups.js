const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createPaginatedMemberList } = require('../utils/listUtils');
const { sendPppLog } = require('../index');

const pupsRoleId = '1379462699364126782';
const pupsManagerRoleId = '1379518462790996108';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pups')
        .setDescription('Manage the Pups role.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lists all users with the Pups role.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Adds the Pups role to a user.')
                .addUserOption(option => option.setName('user').setDescription('The user to add the role to').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Removes the Pups role from a user.')
                .addUserOption(option => option.setName('user').setDescription('The user to remove the role from').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('vote')
                .setDescription('Creates a vote for a player to get the Pups role')
                .addUserOption(option => option.setName('user').setDescription('Player to vote for').setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();
        const role = await interaction.guild.roles.fetch(pupsRoleId);

        if (!role) {
            return interaction.editReply({ content: 'The Pups role was not found. Please check the role ID.' });
        }

        if (subcommand === 'list') {
            await interaction.guild.members.fetch();
            const membersWithRole = interaction.guild.members.cache
                .filter(member => member.roles.cache.has(role.id))
                .sort((a, b) => a.displayName.localeCompare(b.displayName));

            if (membersWithRole.size === 0) {
                return interaction.editReply({ 
                    embeds: [
                        new EmbedBuilder()
                            .setColor(role.color || 'Aqua')
                            .setDescription('🐾 No users currently have the Pups role.')
                    ] 
                });
            }

            const { embeds, components } = createPaginatedMemberList({
                members: [...membersWithRole.values()],
                roleName: 'Pups',
                emoji: '🐾',
                color: role.color || 0x00BFFF,
                itemsPerPage: 15
            });

            const reply = await interaction.editReply({ 
                embeds: [embeds[0]], 
                components: components.length ? components : undefined
            });

            // Handle pagination if there are multiple pages
            if (components.length) {
                const collector = reply.createMessageComponentCollector({ 
                    filter: i => i.user.id === interaction.user.id,
                    time: 300000 // 5 minutes
                });

                let currentPage = 0;
                collector.on('collect', async i => {
                    if (i.customId === 'next') {
                        currentPage++;
                    } else if (i.customId === 'prev') {
                        currentPage--;
                    }

                    // Update button states
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === 0),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === embeds.length - 1)
                    );

                    await i.update({ 
                        embeds: [embeds[currentPage]], 
                        components: [row] 
                    });
                });

                collector.on('end', () => {
                    // Disable all buttons when collector ends
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );
                    reply.edit({ components: [disabledRow] }).catch(console.error);
                });
            }
            return;
        } else if (subcommand === 'vote') {
            const target = interaction.options.getUser('user');
            const embed = new EmbedBuilder()
                .setTitle(`Vote for ${target.username} to receive the Pups role`)
                .setDescription('Please cast your vote below:\n\n' +
                    '⏰ Vote will expire in 7 days\n' +
                    '✅ Yes - Give the role\n' +
                    '❌ No - Do not give the role')
                .setColor('Aqua')
                .setFooter({ text: 'Vote will expire in 7 days' });

            const yesButton = new ButtonBuilder()
                .setCustomId(`ppp-vote-yes-${target.id}-vote`)
                .setLabel('Yes')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success);

            const noButton = new ButtonBuilder()
                .setCustomId(`ppp-vote-no-${target.id}-vote`)
                .setLabel('No')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger);

            const forceStopButton = new ButtonBuilder()
                .setCustomId(`ppp-vote-null-${target.id}-force-stop`)
                .setLabel('Force Stop')
                .setEmoji('🛑')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(false);

            const row = new ActionRowBuilder().addComponents(yesButton, noButton);
            const row2 = new ActionRowBuilder().addComponents(forceStopButton);

            const voteMessage = await interaction.editReply({ 
                embeds: [embed], 
                components: [row, row2], 
                fetchReply: true 
            });

            // Initialize vote session
            interaction.client.pppVoteSessions = interaction.client.pppVoteSessions ?? new Map();
            interaction.client.pppVoteSessions.set(voteMessage.id, {
                role: 'Pups',
                targetId: target.id,
                startTime: Date.now(),
                yes: new Set(),
                no: new Set()
            });

        } else if (subcommand === 'add' || subcommand === 'remove') {
            if (!interaction.member.roles.cache.has(pupsManagerRoleId)) {
                return interaction.editReply({ content: 'You do not have permission to use this command.', ephemeral: true });
            }

            const user = interaction.options.getUser('user');
            const member = await interaction.guild.members.fetch(user.id);

            if (subcommand === 'add') {
                if (member.roles.cache.has(role.id)) {
                    return interaction.editReply({ content: `${user.username} already has the Pups role.`, ephemeral: true });
                }

                // Add the role
                await member.roles.add(role, `Command executed by ${interaction.user.tag}`);
                
                // Log the role addition
                const logEmbed = new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('Pups Role Added')
                    .addFields(
                        { name: 'Member', value: member.toString(), inline: true },
                        { name: 'Moderator', value: interaction.user.toString(), inline: true },
                        { name: 'Reason', value: `Command executed by ${interaction.user.tag}`, inline: false }
                    )
                    .setTimestamp();

                // Use the client's sendPppLog method
                if (interaction.client.sendPppLog) {
                    interaction.client.sendPppLog(interaction.guild, logEmbed);
                } else {
                    // Fallback to regular channel send if sendPppLog is not available
                    const logChannel = interaction.guild.channels.cache.find(ch => ch.name === 'ppp-logs');
                    if (logChannel) {
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

                await interaction.editReply({ content: `Successfully added the Pups role to ${user.username}.` });
            } else { // remove
                if (!member.roles.cache.has(role.id)) {
                    return interaction.editReply({ content: `${user.username} does not have the Pups role.`, ephemeral: true });
                }

                // Remove the role
                await member.roles.remove(role, `Command executed by ${interaction.user.tag}`);
                
                // Log the role removal
                const logEmbed = new EmbedBuilder()
                    .setColor('Orange')
                    .setTitle('Pups Role Removed')
                    .addFields(
                        { name: 'Member', value: member.toString(), inline: true },
                        { name: 'Moderator', value: interaction.user.toString(), inline: true },
                        { name: 'Reason', value: `Command executed by ${interaction.user.tag}`, inline: false }
                    )
                    .setTimestamp();

                // Use the client's sendPppLog method
                if (interaction.client.sendPppLog) {
                    interaction.client.sendPppLog(interaction.guild, logEmbed);
                } else {
                    // Fallback to regular channel send if sendPppLog is not available
                    const logChannel = interaction.guild.channels.cache.find(ch => ch.name === 'ppp-logs');
                    if (logChannel) {
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

                await interaction.editReply({ content: `Successfully removed the Pups role from ${user.username}.` });
            }
        }
    },
};

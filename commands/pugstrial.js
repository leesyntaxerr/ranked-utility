const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const pugsTrialRoleId = '1379519097678729348'; // PUGS TRIAL role ID
const pugsTrialManagerRoleId = '1379518503182405682'; // PUGS MANAGER role ID

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pugstrial')
        .setDescription('Manage the Pugs Trial role.')
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Adds the Pugs Trial role to a user.')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('The user to add the role to')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for adding the trial role')
                        .setRequired(false)))
                        
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Removes the Pugs Trial role from a user.')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('The user to remove the role from')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for removing the trial role')
                        .setRequired(false))),

    async execute(interaction) {
        await interaction.deferReply();

        // Check if user has permission to use this command
        if (!interaction.member.roles.cache.has(pugsTrialManagerRoleId)) {
            return interaction.editReply({ 
                content: '❌ You do not have permission to use this command.', 
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
            // Fetch the member from the guild
            const member = await interaction.guild.members.fetch(targetUser.id);
            const role = await interaction.guild.roles.fetch(pugsTrialRoleId);

            if (!role) {
                return interaction.editReply({ 
                    content: '❌ The Pugs Trial role was not found. Please check the role ID.', 
                    ephemeral: true 
                });
            }

            if (subcommand === 'add') {
                // Check if user already has the role
                if (member.roles.cache.has(pugsTrialRoleId)) {
                    return interaction.editReply({ 
                        content: `❌ ${targetUser.tag} already has the Pugs Trial role.`, 
                        ephemeral: true 
                    });
                }

                // Add the role
                await member.roles.add(role, `Command executed by ${interaction.user.tag}. Reason: ${reason}`);
                
                // Create embed for logging
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('Pugs Trial Role Added')
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: 'Member', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                        { name: 'Moderator', value: interaction.user.tag, inline: true },
                        { name: 'Reason', value: reason, inline: false },
                    )
                    .setTimestamp();

                // Send log to PPP logs
                const logChannel = interaction.guild.channels.cache.find(ch => ch.name === 'ppp-logs');
                if (logChannel) {
                    await logChannel.send({ embeds: [embed] });
                }

                return interaction.editReply({ 
                    content: `✅ Successfully added the Pugs Trial role to ${targetUser.tag}.` 
                });

            } else if (subcommand === 'remove') {
                // Check if user has the role
                if (!member.roles.cache.has(pugsTrialRoleId)) {
                    return interaction.editReply({ 
                        content: `❌ ${targetUser.tag} does not have the Pugs Trial role.`, 
                        ephemeral: true 
                    });
                }

                // Remove the role
                await member.roles.remove(role, `Command executed by ${interaction.user.tag}. Reason: ${reason}`);
                
                // Create embed for logging
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('Pugs Trial Role Removed')
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: 'Member', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                        { name: 'Moderator', value: interaction.user.tag, inline: true },
                        { name: 'Reason', value: reason, inline: false },
                    )
                    .setTimestamp();

                // Send log to PPP logs
                const logChannel = interaction.guild.channels.cache.find(ch => ch.name === 'ppp-logs');
                if (logChannel) {
                    await logChannel.send({ embeds: [embed] });
                }

                return interaction.editReply({ 
                    content: `✅ Successfully removed the Pugs Trial role from ${targetUser.tag}.` 
                });
            }

        } catch (error) {
            console.error('Error in pugstrial command:', error);
            return interaction.editReply({ 
                content: '❌ An error occurred while processing your request.', 
                ephemeral: true 
            });
        }
    },
};

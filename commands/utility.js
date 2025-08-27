const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const STORE = path.join(__dirname, '..', 'utility.json');

function load() {
    if (!fs.existsSync(STORE)) return { autorespond: {}, antilink: false, sticky: {} };
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
}

function save(data) { fs.writeFileSync(STORE, JSON.stringify(data, null, 2)); }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('util')
        .setDescription('Utility admin commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s =>
            s.setName('purge').setDescription('Delete messages')
                .addIntegerOption(o => o.setName('amount').setDescription('1-100').setMinValue(1).setMaxValue(100).setRequired(true)))
        .addSubcommandGroup(g =>
            g.setName('autorespond').setDescription('Autoresponder')
                .addSubcommand(s =>
                    s.setName('add').setDescription('Add autoresponse')
                        .addStringOption(o=>o.setName('trigger').setDescription('Trigger word').setRequired(true))
                        .addStringOption(o=>o.setName('response').setDescription('Bot response').setRequired(true)))
                .addSubcommand(s=>
                    s.setName('remove').setDescription('Remove autoresponse')
                        .addStringOption(o=>o.setName('trigger').setDescription('Trigger').setRequired(true)))
                .addSubcommand(s=>
                    s.setName('list').setDescription('List autoresponses')))
        .addSubcommand(s=>
            s.setName('antilink')
                .setDescription('Toggle anti-link moderation')
                .addStringOption(o=>o.setName('mode').setDescription('on/off').addChoices({name:'on',value:'on'},{name:'off',value:'off'}).setRequired(true)))
        .addSubcommand(s=>
            s.setName('sticky').setDescription('Create sticky message for this channel')
                .addStringOption(o=>o.setName('content').setDescription('Sticky content').setRequired(true))),

    async execute(interaction){
        const store = load();
        const sub = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);

        if (sub==='purge'){
            const amount = interaction.options.getInteger('amount');
            await interaction.channel.bulkDelete(amount, true).catch(()=>{});
            return interaction.reply({content:`Deleted ${amount} messages.`, ephemeral:true});
        }

        if (group==='autorespond'){
            const sub2=sub;
            if (sub2==='add'){
                const trigger=interaction.options.getString('trigger').toLowerCase();
                const response=interaction.options.getString('response');
                store.autorespond[trigger]=response;
                save(store);
                return interaction.reply({content:'Autoresponse added.',ephemeral:true});
            }
            if (sub2==='remove'){
                const trigger=interaction.options.getString('trigger').toLowerCase();
                delete store.autorespond[trigger];
                save(store);
                return interaction.reply({content:'Removed.',ephemeral:true});
            }
            if (sub2==='list'){
                const list=Object.entries(store.autorespond).map(([k,v])=>`**${k}** -> ${v}`).join('\n')||'None';
                return interaction.reply({content:list,ephemeral:true});
            }
        }

        if (sub==='antilink'){
            const mode=interaction.options.getString('mode')==='on';
            store.antilink=mode;
            save(store);
            return interaction.reply({content:`Anti-link is now ${mode?'ON':'OFF'}.`,ephemeral:true});
        }

        if (sub==='sticky'){
            const content=interaction.options.getString('content');
            const channelId=interaction.channel.id;
            const msg=await interaction.channel.send(content);
            store.sticky[channelId]={messageId:msg.id, content};
            save(store);
            return interaction.reply({content:'Sticky set.',ephemeral:true});
        }
    },
    load,
};

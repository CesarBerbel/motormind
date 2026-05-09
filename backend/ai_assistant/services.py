import requests
from django.core.exceptions import ValidationError
from .models import AIProviderConfiguration, AIPrompt

TASK_LABELS = {
    'customer_report': 'melhorar o relato do cliente',
    'diagnosis': 'redigir a descrição do diagnóstico técnico',
    'service_done': 'redigir a descrição do serviço realizado',
    'email': 'redigir texto para email',
    'whatsapp': 'redigir mensagem de WhatsApp',
    'template_email': 'redigir template de email',
    'template_whatsapp': 'redigir template de WhatsApp',
    'general': 'melhorar texto',
}

DEFAULT_TASK_PROMPTS = {
    'customer_report': 'Transforme o relato em um texto claro e organizado, mantendo a linguagem do cliente e sem criar sintomas novos.',
    'diagnosis': 'Escreva um diagnóstico técnico objetivo, com causa provável, evidências observadas e recomendação, sem inventar testes não realizados.',
    'service_done': 'Escreva a descrição do serviço realizado de forma profissional, explicando o que foi feito e quais peças/itens foram tratados, sem criar informações novas.',
    'email': 'Escreva um email profissional, claro e cordial, adequado para cliente de oficina.',
    'whatsapp': 'Escreva uma mensagem curta para WhatsApp, objetiva, cordial e sem HTML.',
    'template_email': 'Crie ou melhore um template de email. Preserve variáveis entre chaves duplas, por exemplo {{ nome_cliente }} e {{ approval_url }}.',
    'template_whatsapp': 'Crie ou melhore um template de WhatsApp curto. Preserve variáveis entre chaves duplas, por exemplo {{ nome_cliente }} e {{ approval_url }}.',
}


def get_active_config():
    qs = AIProviderConfiguration.objects.filter(is_enabled=True).exclude(api_key='')
    return qs.filter(is_default=True).first() or qs.first()


def get_prompt(prompt_id=None, task='general'):
    qs = AIPrompt.objects.filter(is_active=True)
    if prompt_id:
        prompt = qs.filter(pk=prompt_id).first()
        if not prompt:
            raise ValidationError('Prompt de IA inativo ou não encontrado.')
        return prompt
    return qs.filter(task=task, is_default=True).first() or qs.filter(task=task).first() or qs.filter(task=AIPrompt.Task.GENERAL, is_default=True).first() or qs.filter(task=AIPrompt.Task.GENERAL).first()


def build_prompt(task, draft='', context='', custom_prompt=None):
    task_label = TASK_LABELS.get(task, 'melhorar texto')
    selected_prompt = custom_prompt.prompt.strip() if custom_prompt else DEFAULT_TASK_PROMPTS.get(task, DEFAULT_TASK_PROMPTS['email'])
    instructions = [
        f'Tarefa: {task_label}.',
        'Instrução configurada no admin:',
        selected_prompt,
        '',
        'Regras obrigatórias:',
        '- Escreva em português do Brasil, com tom profissional, claro e objetivo.',
        '- Preserve fatos fornecidos. Não invente defeitos, serviços, valores, peças, prazos ou garantias.',
        '- Retorne somente o texto final, sem explicações sobre o que você fez.',
        '- Não corte a resposta. Entregue o texto completo, com começo, meio e fim.',
    ]
    if task in {'whatsapp', 'template_whatsapp'}:
        instructions.append('- Formato adequado para WhatsApp: texto direto, sem HTML.')
    if task in {'email', 'template_email'}:
        instructions.append('- Formato adequado para corpo de email. Não use HTML, salvo se o texto base já estiver em HTML.')
    if task in {'template_email', 'template_whatsapp'}:
        instructions.append('- Preserve variáveis entre chaves duplas, como {{ nome_cliente }} e {{ approval_url }}.')
    if context:
        instructions.append('\nContexto disponível:\n' + context.strip())
    if draft:
        instructions.append('\nTexto base:\n' + draft.strip())
    return '\n'.join(instructions)


def call_openai(config, prompt):
    url = (config.base_url or 'https://api.openai.com/v1').rstrip('/') + '/chat/completions'
    max_tokens = max(int(config.max_tokens or 2500), 1000)
    payload = {
        'model': config.model_name or 'gpt-4o-mini',
        'messages': [
            {'role': 'system', 'content': config.system_prompt or ''},
            {'role': 'user', 'content': prompt},
        ],
        'temperature': float(config.temperature),
        'max_tokens': max_tokens,
    }
    response = requests.post(url, json=payload, headers={'Authorization': f'Bearer {config.api_key}', 'Content-Type': 'application/json'}, timeout=90)
    if response.status_code >= 400:
        raise ValidationError(f'OpenAI retornou erro {response.status_code}: {response.text[:1000]}')
    data = response.json()
    choice = (data.get('choices') or [{}])[0]
    finish_reason = choice.get('finish_reason')
    text = choice.get('message', {}).get('content', '').strip()
    if finish_reason == 'length':
        text += '\n\n[AVISO: a resposta pode ter sido limitada pelo max_tokens configurado no admin. Aumente o limite em Assistente de IA > Configurações de IA.]'
    return text


def call_gemini(config, prompt):
    model = config.model_name or 'gemini-1.5-flash'
    base = (config.base_url or 'https://generativelanguage.googleapis.com/v1beta').rstrip('/')
    url = f'{base}/models/{model}:generateContent?key={config.api_key}'
    max_tokens = max(int(config.max_tokens or 2500), 1000)
    full_prompt = '\n\n'.join([p for p in [config.system_prompt, prompt] if p])
    payload = {
        'contents': [{'parts': [{'text': full_prompt}]}],
        'generationConfig': {'temperature': float(config.temperature), 'maxOutputTokens': max_tokens},
    }
    response = requests.post(url, json=payload, headers={'Content-Type': 'application/json'}, timeout=90)
    if response.status_code >= 400:
        raise ValidationError(f'Gemini retornou erro {response.status_code}: {response.text[:1000]}')
    data = response.json()
    candidate = (data.get('candidates') or [{}])[0]
    parts = ((candidate.get('content') or {}).get('parts') or [])
    text = ''.join(part.get('text', '') for part in parts).strip()
    if candidate.get('finishReason') == 'MAX_TOKENS':
        text += '\n\n[AVISO: a resposta pode ter sido limitada pelo max_tokens configurado no admin. Aumente o limite em Assistente de IA > Configurações de IA.]'
    return text


def generate_text(*, task, draft='', context='', prompt_id=None):
    config = get_active_config()
    if not config:
        raise ValidationError('Nenhum provedor de IA ativo/configurado no admin do Django.')
    custom_prompt = get_prompt(prompt_id=prompt_id, task=task)
    prompt = build_prompt(task, draft, context, custom_prompt=custom_prompt)
    if config.provider == AIProviderConfiguration.Provider.OPENAI:
        text = call_openai(config, prompt)
    elif config.provider == AIProviderConfiguration.Provider.GEMINI:
        text = call_gemini(config, prompt)
    else:
        raise ValidationError('Provedor de IA invalido.')
    if not text:
        raise ValidationError('O provedor de IA retornou resposta vazia.')
    return {'text': text, 'provider': config.provider, 'model': config.model_name, 'prompt': custom_prompt.name if custom_prompt else 'Padrão do sistema'}
